import { elapsed, hhmmss } from "../format";
import type { Active } from "../types";
import { ActiveGlyph } from "./Spinner";

export type BannerProps =
  | { kind: "busy"; active: Active; machineNames: Record<string, string>; deploymentNames: Record<string, string>; startedAt: string | null; now: number }
  | { kind: "offline"; message: string; lastOkAt: number | null }
  | { kind: "rejected" };

export function Banner(props: BannerProps) {
  if (props.kind === "busy") {
    const { active, machineNames, deploymentNames, startedAt, now } = props;
    const targetNames = ["start", "stop"].includes(active.action) ? deploymentNames : ["on", "off"].includes(active.action) ? machineNames : {};
    return (
      <div className="banner busy" role="status">
        <span className="bn-tag">HUB BUSY</span>
        <span className="bn-spin" aria-hidden="true">
          <ActiveGlyph />
        </span>
        <span className="bn-msg">
          <b>{active.action}</b> <b className="hi">{targetNames[active.target] ?? active.target}</b>
          <i>·</i>
          <span className="mc">{active.machines.map((id) => machineNames[id] ?? id).join(", ")}</span>
        </span>
        <span className="bn-meta">
          controls locked{startedAt && ` · ${elapsed(startedAt, now)}`}
        </span>
      </div>
    );
  }
  if (props.kind === "offline") {
    return (
      <div className="banner off" role="alert">
        <span className="bn-tag">HUB OFFLINE</span>
        <span className="bn-msg">
          last poll failed <i>·</i>
          <span className="mc">{props.message}</span>
        </span>
        <span className="bn-meta">
          {props.lastOkAt ? `showing data from ${hhmmss(props.lastOkAt)}` : "no data yet"}
        </span>
      </div>
    );
  }
  return (
    <div className="banner rej" role="alert">
      <span className="bn-tag">HUB REJECTED TOKEN</span>
      <span className="bn-msg">
        the hub answered 401 <i>·</i>
        <span className="mc">check AGORA_HUB_ADMIN_TOKEN</span>
      </span>
    </div>
  );
}
