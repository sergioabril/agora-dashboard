import { useLayoutEffect, useRef, type ReactNode } from "react";
import { dur, hhmmss, stamp } from "../format";
import type { LogLine, Operation } from "../types";
import { MonoSpin } from "./Spinner";

export type Observation = { checkedAt: string; rows: [string, string][]; errors: string[]; okNote?: string };

function Ln({ no = "", cls = "", children }: { no?: string; cls?: string; children: ReactNode }) {
  return (
    <div className={`ln ${cls}`}>
      <span className="no">{no}</span>
      <span>{children}</span>
    </div>
  );
}

function hl(line: string): ReactNode {
  let m: RegExpExecArray | null;
  if ((m = /^\$\s(.*)$/.exec(line))) return <><span className="sh">$</span> <span className="v">{m[1]}</span></>;
  if ((m = /^(\[[^\]]+\])(.*)$/.exec(line))) return <><span className="tag">{m[1]}</span>{m[2]}</>;
  if ((m = /^([a-z]+:)(\s.*)$/i.exec(line))) return <><span className="px">{m[1]}</span>{m[2]}</>;
  return line;
}

const outLines = (op: Operation | null) => (op?.output ? op.output.replace(/\n+$/, "").split("\n") : []);

export function logCount(op: Operation | null): number {
  return outLines(op).length;
}

export function LogToggle({ open, id, count, bang, onClick }: { open: boolean; id: string; count: number; bang: boolean; onClick: () => void }) {
  return (
    <button type="button" className="dtg" aria-expanded={open} aria-controls={id} onClick={onClick}>
      <span aria-hidden="true">{open ? "▾" : "▸"}</span>log
      <span className="n">{count ? `[${count}]` : ""}</span>
      {bang && <span className="bang" aria-label="has errors">!</span>}
    </button>
  );
}

const TAG = { hub: "hub│", stdout: "out│", stderr: "err│" };

function Lx({ line: l }: { line: LogLine }) {
  return (
    <div className={`ln lx src-${l.source}`}>
      <span className="no">{TAG[l.source]}</span>
      <span>{l.source === "stdout" ? hl(l.text) : l.text}</span>
      <span className="ts">{hhmmss(l.at)}</span>
    </div>
  );
}

type DrawerProps = { open: boolean; id: string; op: Operation | null; lines: LogLine[] | null; live: boolean; obs: Observation };

export function LogDrawer({ open, id, op, lines, live, obs }: DrawerProps) {
  // Keeps the newest line in view unless the user scrolled up.
  const term = useRef<HTMLDivElement>(null);
  const tail = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const below = () => (tail.current && term.current ? tail.current.getBoundingClientRect().top - term.current.getBoundingClientRect().bottom + 10 : 0);
  useLayoutEffect(() => {
    if (pinned.current && term.current) term.current.scrollTop += below();
  }, [lines, live, open]);
  return (
    <div className="drawer" id={id} inert={!open}>
      <div className="drawer-in">
        <div className="term" ref={term} onScroll={() => (pinned.current = below() < 24)}>
          {op ? (
            <>
              <Ln no="#" cls="cm">op <span className="v">{op.action}</span> · {op.status}</Ln>
              <Ln cls="cm">started  {stamp(op.started_at)}</Ln>
              {op.finished_at && <Ln cls="cm">finished {stamp(op.finished_at)} · took {dur(op.started_at, op.finished_at)}</Ln>}
              <div className="gap" />
              {lines ? (
                <>
                  {lines.map((l, i) => <Lx key={i} line={l} />)}
                  {live && (lines.length
                    ? <div className="ln lx live"><span className="no">{"   │"}</span><span><MonoSpin /></span><span className="ts">live</span></div>
                    : <Ln cls="dim">waiting for output…</Ln>)}
                  {!live && !lines.length && <Ln cls="dim">(no output)</Ln>}
                  <div ref={tail} />
                </>
              ) : (
                <>
                  {outLines(op).map((l, i) => <Ln key={i} no={String(i + 1)}>{hl(l)}</Ln>)}
                  {!op.output && <Ln cls="dim">{op.status === "in_progress" ? "output arrives when the operation finishes" : "(no output)"}</Ln>}
                </>
              )}
              {op.error ? <Ln no="✗" cls="er">{op.error}</Ln> : op.status === "succeeded" && <Ln no="✓" cls="ok2">exit ok</Ln>}
            </>
          ) : (
            <Ln no="#" cls="cm">no operation recorded by the hub</Ln>
          )}
          <div className="gap" />
          <Ln no="#" cls="cm">observation · {stamp(obs.checkedAt)}</Ln>
          {obs.rows.map(([k, v]) => (
            <Ln key={k}><span className="k">{k.padEnd(18)}</span> <span className="v">{v}</span></Ln>
          ))}
          {obs.errors.map((e, i) => <Ln key={i} no="!" cls="er">{e}</Ln>)}
          {!obs.errors.length && obs.okNote && <Ln no="✓" cls="ok2">{obs.okNote}</Ln>}
        </div>
      </div>
    </div>
  );
}
