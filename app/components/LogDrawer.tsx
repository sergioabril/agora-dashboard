import type { ReactNode } from "react";
import { dur, stamp } from "../format";
import type { Operation } from "../types";

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

export function LogDrawer({ open, id, op, obs }: { open: boolean; id: string; op: Operation | null; obs: Observation }) {
  return (
    <div className="drawer" id={id} inert={!open}>
      <div className="drawer-in">
        <div className="term">
          {op ? (
            <>
              <Ln no="#" cls="cm">op <span className="v">{op.action}</span> · {op.status}</Ln>
              <Ln cls="cm">started  {stamp(op.started_at)}</Ln>
              {op.finished_at && <Ln cls="cm">finished {stamp(op.finished_at)} · took {dur(op.started_at, op.finished_at)}</Ln>}
              <div className="gap" />
              {outLines(op).map((l, i) => <Ln key={i} no={String(i + 1)}>{hl(l)}</Ln>)}
              {!op.output && <Ln cls="dim">{op.status === "in_progress" ? "output arrives when the operation finishes" : "(no output)"}</Ln>}
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
