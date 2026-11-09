import { LOGO } from "../ascii";
import { Led } from "./Led";

export type HubLink = "connecting" | "ok" | "offline";

const TONE = { connecting: "yellow", ok: "green", offline: "red" } as const;
const SR = { connecting: "connecting", ok: "hub connected", offline: "hub offline" };

export function Rail({ hub, title }: { hub: HubLink; title?: string }) {
  return (
    <nav className="rail" aria-label="Primary">
      <a className="logo" href="/" aria-label="agora">
        <pre aria-hidden="true">{LOGO}</pre>
        <span className="w">agora</span>
      </a>
      <div className="nav">
        <a className="on" href="/" aria-current="page">
          <pre aria-hidden="true">
            {"╭───╮\n│ "}
            <span className="tl">~</span>
            {" │\n╰───╯"}
          </pre>
          <span>home</span>
        </a>
      </div>
      <div className={`hubled t-${TONE[hub]}`} role="status" aria-live="polite" title={`hub: ${title ?? SR[hub]}`}>
        <Led tone={TONE[hub]} pulse={hub === "connecting"} />
        <span>hub</span>
        <span className="sr">{SR[hub]}</span>
      </div>
    </nav>
  );
}
