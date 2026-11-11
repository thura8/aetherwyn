/**
 * Runs the game over HTTPS on the local network. Phone browsers only allow motion sensors and
 * the microphone on secure pages, and phones reach the game by this computer's network address,
 * so plain `pnpm dev` is not enough for casting spells.
 *
 *   pnpm dev:secure
 *
 * The first run creates a small certificate authority (CA) in `.certs/`. Each phone trusts it
 * once: open the printed certificate link on the phone and follow the steps there (also in the
 * README). The server certificate is re-issued automatically when the address changes (a new
 * Wi-Fi). Needs `openssl` (built into macOS). Override the address with LAN_IP=…
 * Ported from the Aetherwyn game's scripts/dev-secure.ts.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createServer as createProbe } from "node:net";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CERT_DIR = join(ROOT, ".certs");
const CA_KEY = join(CERT_DIR, "aetherwyn-ca.key");
const CA_CERT = join(CERT_DIR, "aetherwyn-ca.crt");
const SERVER_KEY = join(CERT_DIR, "server.key");
const SERVER_CERT = join(CERT_DIR, "server.crt");
const SERVER_HOSTS = join(CERT_DIR, "server-hosts.txt");

const APP_PORT = 3000;
/** Plain HTTP, only to hand the CA certificate to phones that don't trust it yet. */
const CERT_PORT = 3080;

let app = null;

function lanAddress() {
  const override = process.env.LAN_IP?.trim();
  if (override) return override;
  const interfaces = networkInterfaces();
  const preferred = ["en0", "en1", "wlan0", "eth0"];
  const names = [
    ...preferred,
    ...Object.keys(interfaces).filter((name) => !preferred.includes(name)),
  ];
  for (const name of names) {
    const address = interfaces[name]?.find(
      (a) => a.family === "IPv4" && !a.internal,
    );
    if (address) return address.address;
  }
  throw new Error(
    "No network address found. Connect to Wi-Fi (or set LAN_IP=…) and try again.",
  );
}

/** Fails early, and clearly, when `pnpm dev` or another server already uses a port. */
function assertPortFree(port) {
  return new Promise((resolve, reject) => {
    const probe = createProbe();
    probe.once("error", () =>
      reject(
        new Error(
          `Port ${port} is already in use. Stop \`pnpm dev\` (or whatever uses it) first, then run this again.`,
        ),
      ),
    );
    probe.listen(port, "0.0.0.0", () => probe.close(() => resolve()));
  });
}

function openssl(args) {
  try {
    execFileSync("openssl", args, { stdio: "pipe" });
  } catch (error) {
    throw new Error(
      `openssl ${args[0]} failed:\n${error.stderr?.toString() ?? error}`,
    );
  }
}

/** A long-lived local CA. Phones trust it once; every server certificate is signed by it. */
function ensureCertificateAuthority() {
  if (existsSync(CA_KEY) && existsSync(CA_CERT)) return;
  const config = join(CERT_DIR, "ca.cnf");
  writeFileSync(
    config,
    [
      "[req]",
      "distinguished_name = dn",
      "x509_extensions = v3_ca",
      "prompt = no",
      "[dn]",
      "CN = Aetherwyn Local Development CA",
      "O = Aetherwyn (local only)",
      "[v3_ca]",
      "basicConstraints = critical, CA:TRUE",
      "keyUsage = critical, keyCertSign, cRLSign",
      "subjectKeyIdentifier = hash",
    ].join("\n"),
  );
  openssl(["genrsa", "-out", CA_KEY, "2048"]);
  openssl([
    "req", "-x509", "-new", "-key", CA_KEY, "-sha256", "-days", "3650",
    "-config", config, "-out", CA_CERT,
  ]);
  console.log(`Created a local certificate authority: ${CA_CERT}`);
}

/** A server certificate for this address (and localhost), re-issued when the address changes. */
function ensureServerCertificate(ip) {
  const hosts = `${ip},localhost,127.0.0.1`;
  if (
    existsSync(SERVER_CERT) &&
    existsSync(SERVER_HOSTS) &&
    readFileSync(SERVER_HOSTS, "utf8") === hosts
  )
    return;
  const csr = join(CERT_DIR, "server.csr");
  const ext = join(CERT_DIR, "server.ext");
  writeFileSync(
    ext,
    [
      "basicConstraints = CA:FALSE",
      "keyUsage = critical, digitalSignature, keyEncipherment",
      "extendedKeyUsage = serverAuth",
      `subjectAltName = IP:${ip}, IP:127.0.0.1, DNS:localhost`,
    ].join("\n"),
  );
  openssl(["genrsa", "-out", SERVER_KEY, "2048"]);
  openssl(["req", "-new", "-key", SERVER_KEY, "-subj", `/CN=${ip}`, "-out", csr]);
  // iOS rejects server certificates valid for more than 398 days.
  openssl([
    "x509", "-req", "-in", csr, "-CA", CA_CERT, "-CAkey", CA_KEY, "-CAcreateserial",
    "-days", "397", "-sha256", "-extfile", ext, "-out", SERVER_CERT,
  ]);
  writeFileSync(SERVER_HOSTS, hosts);
  console.log(`Issued a certificate for ${ip}`);
}

/** Serves the CA certificate over plain HTTP so a phone can install it before it trusts HTTPS. */
function serveCertificate(ip) {
  const page = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Aetherwyn certificate</title>
<body style="font-family:system-ui;background:#141a2e;color:#ede6ff;padding:1.5rem;line-height:1.5">
<h1 style="color:#fadc98">Trust Aetherwyn on this phone</h1>
<p><a style="color:#94e1f3;font-size:1.2rem" href="/aetherwyn-ca.crt">Download the certificate</a></p>
<p><b>iPhone:</b> tap Allow, then Settings › General › VPN &amp; Device Management › install the profile.
Then Settings › General › About › Certificate Trust Settings › turn on "Aetherwyn Local Development CA".</p>
<p><b>Android:</b> Settings › Security › More security › Encryption &amp; credentials › Install a certificate › CA certificate, and pick the downloaded file.</p>
<p>Then scan the QR code on the big screen (it opens <span style="color:#94e1f3">https://${ip}:${APP_PORT}/join</span>).</p>
<p style="color:#a9a2c8">This certificate only works for games on this computer. Remove it from the phone when you're done.</p>`;
  createServer((req, res) => {
    if (req.url === "/aetherwyn-ca.crt") {
      res.writeHead(200, {
        "content-type": "application/x-x509-ca-cert",
        "content-disposition": 'attachment; filename="aetherwyn-ca.crt"',
      });
      res.end(readFileSync(CA_CERT));
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(page);
  }).listen(CERT_PORT, "0.0.0.0");
}

function shutdown() {
  try {
    if (app?.pid) process.kill(-app.pid, "SIGTERM");
  } catch {
    // Already gone.
  }
  setTimeout(() => process.exit(), 1500).unref();
}

async function main() {
  await Promise.all([APP_PORT, CERT_PORT].map(assertPortFree));
  const ip = lanAddress();
  mkdirSync(CERT_DIR, { recursive: true });
  ensureCertificateAuthority();
  ensureServerCertificate(ip);
  serveCertificate(ip);
  // Phones that can't use their built-in speech download this once (see prepare-voice-model.mjs).
  execFileSync("node", [join(ROOT, "scripts", "prepare-voice-model.mjs")], {
    stdio: "inherit",
  });

  // Its own process group, so stopping ends everything `next dev` started.
  app = spawn(
    "pnpm",
    [
      "exec", "next", "dev", "--port", String(APP_PORT), "--hostname", "0.0.0.0",
      "--experimental-https",
      "--experimental-https-key", SERVER_KEY,
      "--experimental-https-cert", SERVER_CERT,
    ],
    { cwd: ROOT, stdio: "inherit", detached: true },
  );
  app.once("exit", (code) => {
    console.error(`\nThe game server stopped (code ${code ?? "?"}).`);
    process.exitCode = code ?? 1;
    shutdown();
  });

  console.log(`
  Aetherwyn is starting over HTTPS on ${ip}

    Big screen     https://${ip}:${APP_PORT}   (open this on the computer)
    Phones         scan the QR code in the lobby

  First time on a phone? Open http://${ip}:${CERT_PORT} on it to install the certificate.
  On this computer, trust ${CA_CERT}
  in Keychain Access (or accept the browser warning once).

  Press Ctrl+C to stop.
`);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
  shutdown();
});
