import { closeRoom, openRoom } from "@/server/roomStore";

/** The big screen opens (or reopens) its room. */
export async function PUT(
  _request: Request,
  ctx: RouteContext<"/api/rooms/[code]">,
) {
  const { code } = await ctx.params;
  const room = openRoom(code);
  if (!room)
    return Response.json({ ok: false, error: "bad-code" }, { status: 400 });
  return Response.json({ ok: true, room });
}

/** The big screen closes its room; phones see the portal close. */
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/rooms/[code]">,
) {
  const { code } = await ctx.params;
  closeRoom(code);
  return Response.json({ ok: true });
}
