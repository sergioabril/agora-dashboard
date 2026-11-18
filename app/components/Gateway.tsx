import type { Gateway as GatewayStatus } from "../types";
import { CopyButton } from "./DeploymentCard";
import { Led } from "./Led";

const NOTE = "OpenAI-compatible · send Authorization: Bearer <gateway key> from the hub's hub.yaml";

// <wbr> before /openai/v1: a phone that can't fit label, URL and copy on one line breaks there, not mid-word.
function Address({ label, path, base }: { label: string; path: string; base: string }) {
  return (
    <span className="gwh" title={NOTE}>
      <span className="k">{label}</span>
      <span className="u">{base}<wbr />{path}</span>
      <CopyButton text={`${base}${path}`} label="Copy OpenAI URL" />
    </span>
  );
}

export function Gateway({ gateway, host, running }: { gateway: GatewayStatus; host: string; running: number }) {
  const base = `http://${host}:${gateway.port}`;
  const tone = running > 0 ? "green" : "dim";
  return (
    <>
      <Address label="openai" path="/openai/v1" base={base} />
      <span className={`sm t-${tone}`}><Led tone={tone} />{running} running</span>
    </>
  );
}
