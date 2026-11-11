/** Sends one playtest event to the dev server (logs/playtest.jsonl). Never throws, never blocks play. */
export function logPlaytest(kind: string, data: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  try {
    void fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        kind,
        ua: navigator.userAgent,
        ...data,
      }),
    }).catch(() => {});
  } catch {
    /* logging must never affect the game */
  }
}
