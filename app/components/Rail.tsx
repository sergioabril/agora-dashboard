import type { ReactNode } from "react";
import { COG, LOGO } from "../ascii";
import { Led } from "./Led";

export type HubLink = "connecting" | "ok" | "offline";

const TONE = { connecting: "yellow", ok: "green", offline: "red" } as const;
const SR = { connecting: "connecting", ok: "hub connected", offline: "hub offline" };

function NavItem({ href, on, label, children }: { href: string; on: boolean; label: string; children: ReactNode }) {
  return (
    <a className={on ? "on" : undefined} href={href} aria-current={on ? "page" : undefined}>
      <pre aria-hidden="true">{"╭───╮\n│ "}<span className="tl">{children}</span>{" │\n╰───╯"}</pre>
      <span>{label}</span>
    </a>
  );
}

export function Rail({ hub, title, page }: { hub: HubLink; title?: string; page: "home" | "settings" }) {
  return (
    <nav className="rail" aria-label="Primary">
      <a className="logo" href="/" aria-label="agora">
        <pre aria-hidden="true">{LOGO}</pre>
        <span className="w">agora</span>
      </a>
      <div className="nav">
        <NavItem href="/" on={page === "home"} label="home">~</NavItem>
        <NavItem href="/settings" on={page === "settings"} label="settings"><span className="cog">{COG}</span></NavItem>
      </div>
      <div className={`hubled t-${TONE[hub]}`} role="status" aria-live="polite" title={`hub: ${title ?? SR[hub]}`}>
        <Led tone={TONE[hub]} pulse={hub === "connecting"} />
        <span>hub</span>
        <span className="sr">{SR[hub]}</span>
      </div>
    </nav>
  );
}
