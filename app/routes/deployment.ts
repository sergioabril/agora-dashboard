// Resource route: relays the hub's NDJSON deployment stream, so the token stays server-side.
import type { Route } from "./+types/deployment";
import { deploymentOutput, deploymentStream, type HubStream } from "../hub.server";
import { failure, parseAction } from "../live";

function relay(r: HubStream): Response {
  if (!r.ok) return Response.json(failure(r.error), { status: r.error.status ?? 502 });
  // When the browser leaves, the aborted hub body ends the relay quietly instead of surfacing as a server error.
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  r.body.pipeTo(writable, { preventAbort: true }).catch(() => writable.close().catch(() => {}));
  return new Response(readable, {
    status: r.status,
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}

export async function action({ request, params }: Route.ActionArgs) {
  const form = await request.formData();
  const parsed = parseAction({ kind: "deployment", id: params.id, action: form.get("action") });
  if (!parsed.ok) return Response.json(parsed, { status: 422 });
  return relay(await deploymentStream(parsed.request.id, parsed.request.action as "start" | "stop", request.signal));
}

export async function loader({ request, params }: Route.LoaderArgs) {
  return relay(await deploymentOutput(params.id, request.signal));
}
