import type { Gateway as GatewayStatus } from "../types";
import { CopyButton } from "./DeploymentCard";
import { Led } from "./Led";

const NOTE = "OpenAI-compatible · send Authorization: Bearer <gateway key> from the hub's hub.yaml";

// <wbr> before /proxy/v1 · /agent/v1: a phone that can't fit label, URL and copy on one line breaks there, not mid-word.
function Address({ k, base }: { k: "proxy" | "agent"; base: string }) {
  return (
    <span className="gwh" title={NOTE}>
      <span className="k">{k}</span>
      <span className="u">{base}<wbr />/{k}/v1</span>
      <CopyButton text={`${base}/${k}/v1`} label={`Copy ${k} URL`} />
    </span>
  );
}

export function Gateway({ gateway, host, running }: { gateway: GatewayStatus; host: string; running: number }) {
  const base = `http://${host}:${gateway.port}`;
  const tone = running > 0 ? "green" : "dim";
  return (
    <>
      <Address k="proxy" base={base} />
      <Address k="agent" base={base} />
      <span className={`sm t-${tone}`}><Led tone={tone} />{running} running</span>
    </>
  );
}
