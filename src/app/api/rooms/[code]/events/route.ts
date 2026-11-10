import { subscribe } from "@/server/roomStore";

const HEARTBEAT_MS = 15000;

/**
 * Server-Sent Events: the room's snapshot on connect and after every change.
 * `?role=host` for the big screen, `?seat=<id>` for a phone. An unknown room or seat gets `event: gone`.
 */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/rooms/[code]/events">,
) {
  const { code } = await ctx.params;
  const url = new URL(request.url);
  const seatId = url.searchParams.get("seat");
  const who =
    url.searchParams.get("role") === "host"
      ? ({ role: "host" } as const)
      : ({ role: "player", seatId: seatId ?? "" } as const);

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          cleanup();
        }
      };
      const unsubscribe = subscribe(code, who, (room) => {
        send(`data: ${JSON.stringify(room)}\n\n`);
      });
      if (!unsubscribe) {
        send("event: gone\ndata: {}\n\n");
        controller.close();
        return;
      }
      const heartbeat = setInterval(
        () => send(": keep-alive\n\n"),
        HEARTBEAT_MS,
      );
      let done = false;
      cleanup = () => {
        if (done) return;
        done = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      request.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
