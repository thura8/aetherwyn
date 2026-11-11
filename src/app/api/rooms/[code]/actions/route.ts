import { applyAction } from "@/server/roomStore";
import type { RelayAction } from "@/shared/relay";

/** Every change to a room, from the big screen or a phone. Validation lives in roomStore. */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/rooms/[code]/actions">,
) {
  const { code } = await ctx.params;
  let action: RelayAction;
  try {
    action = (await request.json()) as RelayAction;
  } catch {
    return Response.json({ ok: false, error: "bad-request" }, { status: 400 });
  }
  const result = applyAction(code, action);
  return Response.json(result, { status: result.ok ? 200 : 409 });
}
