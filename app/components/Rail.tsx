import { Fragment, useEffect, type ReactNode } from "react";
import { Link, NavLink, useOutletContext } from "react-router";
import { artSegments, COG, HOME_ICON, LOGO } from "../ascii";
import { Led } from "./Led";

export type HubLink = "connecting" | "ok" | "offline";
export type Hub = { link: HubLink; title?: string };

const TONE = { connecting: "yellow", ok: "green", offline: "red" } as const;
const SR = { connecting: "connecting", ok: "hub connected", offline: "hub offline" };

// The rail lives in the root layout so it stays mounted across navigations; each route reports its hub link to it.
export function useHub(link: HubLink, title?: string) {
  const setHub = useOutletContext<(hub: Hub) => void>();
  useEffect(() => setHub({ link, title }), [setHub, link, title]);
}

function Icon({ art }: { art: string[] }) {
  return (
    <pre className="ico" aria-hidden="true">
      {artSegments(art).map((segs, i) => (
        <Fragment key={i}>
          {i > 0 && "\n"}
          {segs.map((s, j) => (s.cls ? <span key={j} className={s.cls}>{s.text}</span> : s.text))}
        </Fragment>
      ))}
    </pre>
  );
}

function NavItem({ to, label, className = "", children }: { to: string; label: string; className?: string; children: ReactNode }) {
  return (
    <NavLink to={to} end aria-label={label} className={({ isActive }) => `${className}${isActive ? " on" : ""}`.trim() || undefined}>
      {children}
    </NavLink>
  );
}

export function Rail({ hub: { link, title } }: { hub: Hub }) {
  return (
    <nav className="rail" aria-label="Primary">
      <Link className="logo" to="/" aria-label="agora">
        <pre aria-hidden="true">{LOGO}</pre>
        <span className="w">agora</span>
      </Link>
      <div className="nav">
        <NavItem to="/" label="home"><Icon art={HOME_ICON} /></NavItem>
      </div>
      <NavItem to="/settings" label="settings" className="set"><span className="cog" aria-hidden="true">{COG}</span></NavItem>
      <div className={`hubled t-${TONE[link]}`} role="status" aria-live="polite" title={`hub: ${title ?? SR[link]}`}>
        <Led tone={TONE[link]} pulse={link === "connecting"} />
        <span>hub</span>
        <span className="sr">{SR[link]}</span>
      </div>
    </nav>
  );
}
