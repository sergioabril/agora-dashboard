import { useEffect, useState, type ReactNode } from "react";
import { ago } from "../format";
import { machineDisplay } from "../model";
import type { DeploymentsStatus, MachinesStatus } from "../types";
import { useReducedMotion } from "./anim";
import { Ps1 } from "./Ps1";
import { MonoSpin } from "./Spinner";

type StatusProps = {
  machines: MachinesStatus | null;
  deployments: DeploymentsStatus | null;
  refreshing: boolean;
  offline: boolean;
  rejected?: boolean;
  lastOkAt: number | null;
  now: number;
};

type Props = { command: string; fig: string; label: string; refreshing: boolean; onRefresh: () => void; children: ReactNode };

function useTyped(text: string): string {
  const reduced = useReducedMotion();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (reduced) return setN(text.length);
    let i = 0;
    let t: ReturnType<typeof setTimeout>;
    const step = () => {
      setN(++i);
      if (i < text.length) t = setTimeout(step, 24 + Math.random() * 38);
    };
    t = setTimeout(step, 520);
    return () => clearTimeout(t);
  }, [text, reduced]);
  return text.slice(0, n);
}

export function StatusLine({ machines, deployments, refreshing, offline, rejected, lastOkAt, now }: StatusProps) {
  if (!machines) {
    return offline ? (
      <><span className="bad">{rejected ? "hub rejected token" : "hub unreachable"}</span><i>·</i>no data yet</>
    ) : (
      <span className="rf"><MonoSpin /> connecting to hub…</span>
    );
  }
  const ms = Object.values(machines.machines);
  const online = ms.filter((m) => machineDisplay(m).label === "online").length;
  const running = Object.values(deployments?.deployments ?? {}).filter((d) => d.observed_state === "running").length;
  return (
    <>
      <b>{online}</b>/{ms.length} online<i>·</i>
      <b>{running}</b> running<i>·</i>
      {refreshing ? (
        <span className="rf">refreshing <MonoSpin /></span>
      ) : (
        <>refreshed <span className={offline ? "bad" : undefined}>{ago(lastOkAt, now)}</span></>
      )}
      {offline && <><i>·</i><span className="bad">{rejected ? "token rejected" : "hub offline"}</span></>}
    </>
  );
}

export function Header({ command, fig, label, refreshing, onRefresh, children }: Props) {
  const typed = useTyped(command);
  const reduced = useReducedMotion();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if ((e.key === "r" || e.key === "R") && !e.metaKey && !e.ctrlKey && !e.altKey && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") onRefresh();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onRefresh]);
  return (
    <>
      <div className={`scanbar${refreshing && !reduced ? " on" : ""}`} aria-hidden="true" />
      <header className="top">
        <div className="top-l">
          <div className="prompt" aria-hidden="true">
            <Ps1 /> <span className="cmd">{typed}</span>
            <span className="cursor" />
          </div>
          <h1 className="title">
            <span className="sr">{label}</span>
            <pre className="fig" aria-hidden="true">{fig}</pre>
            <pre className="fig ghost g1" aria-hidden="true">{fig}</pre>
            <pre className="fig ghost g2" aria-hidden="true">{fig}</pre>
          </h1>
          <p className="statusline">
            {children}
          </p>
        </div>
        <div className="top-r">
          <button className={`btn${refreshing && !reduced ? " spinning" : ""}`} type="button" aria-label="Refresh now" aria-busy={refreshing} onClick={onRefresh}>
            <span className="ico" aria-hidden="true">↻</span>
            <span className="bt">refresh</span>
            <kbd>r</kbd>
          </button>
        </div>
      </header>
    </>
  );
}
