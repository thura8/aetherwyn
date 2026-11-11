import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * Playtest log: phones POST one JSON event per cast and each lands as a line in logs/playtest.jsonl.
 * Development only: a production build answers 404 and writes nothing.
 */
const LOG_FILE = path.join(process.cwd(), "logs", "playtest.jsonl");
const MAX_BYTES = 8_000;

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production")
    return new Response(null, { status: 404 });
  const text = await request.text();
  if (text.length > MAX_BYTES) return new Response(null, { status: 413 });
  let event: unknown;
  try {
    event = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const line = JSON.stringify({ at: new Date().toISOString(), ...(event as object) });
  await mkdir(path.dirname(LOG_FILE), { recursive: true });
  await appendFile(LOG_FILE, line + "\n");
  return new Response(null, { status: 204 });
}
