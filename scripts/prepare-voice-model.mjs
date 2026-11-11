// Puts the on-device voice model where the app serves it: Vosk's small English model (~40 MB),
// in public/models (git-ignored), checked against a pinned checksum. Only phones whose built-in
// speech recognition returns no words download it, once; the browser then caches it.
// Set VOICE_MODEL_SOURCE to a local copy of the file to skip the download.
// Ported from the Aetherwyn game's prepare-voice-model.mjs.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(ROOT, "public", "models", "vosk-model-small-en-us-0.15.tar.gz");
const URL = "https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz";
const SHA256 = "f0b24bb92a48ca575b6a96500d6b543f0f079c573dfe85bbe16001fc0404e1d8";

const digest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

if (existsSync(FILE) && digest(FILE) === SHA256) process.exit(0);
mkdirSync(dirname(FILE), { recursive: true });
const partial = `${FILE}.partial`;

const source = process.env.VOICE_MODEL_SOURCE;
if (source && existsSync(source)) {
  copyFileSync(source, partial);
} else {
  console.info(`Downloading the voice model (about 40 MB, once) from ${URL} …`);
  const response = await fetch(URL).catch(() => null);
  if (!response?.ok) {
    console.error(
      "Couldn't download the voice model. Phones whose own speech recognition works still hear words; others cast from the move alone.",
    );
    process.exit(0);
  }
  writeFileSync(partial, Buffer.from(await response.arrayBuffer()));
}
const got = digest(partial);
if (got !== SHA256) {
  console.error(`The voice model has an unexpected checksum (${got}); not using it.`);
  process.exit(1);
}
renameSync(partial, FILE);
console.info("Voice model ready.");
