import { useState, type ReactNode } from "react";
import { hhmm } from "../format";
import type { Operation } from "../types";
import { Spinner } from "./Spinner";
import { LogDrawer, LogToggle, logCount, type Observation } from "./LogDrawer";

export type Busy = null | "active" | "waiting";

type Props = {
  id: string;
  title: ReactNode;
  status: ReactNode;
  bottom: ReactNode;
  busy: Busy;
  index?: number;
  op: Operation | null;
  obs: Observation;
  hasError: boolean;
  busyLabel: string;
  control: ReactNode;
  children: ReactNode;
};

export function CardFrame({ id, title, status, bottom, busy, busyLabel, index, op, obs, hasError, control, children }: Props) {
  const [open, setOpen] = useState(false);
  const did = `drw-${id.replace(/[^a-z0-9_-]/gi, "-")}`;
  const cls = `card${busy === "active" ? " is-act" : busy === "waiting" ? " is-wait" : ""}${open ? " open" : ""}`;
  return (
    <article className={cls} style={{ "--i": index ?? 0 } as React.CSSProperties}>
      <div className="fr fr-top">
        <span className="c" aria-hidden="true">╭─</span>
        <span className="ttl">{title}</span>
        <span className="fill" aria-hidden="true" />
        <span className="st">{status}</span>
        <span className="c" aria-hidden="true">─╮</span>
      </div>
      <div className="fr-body">
        <div className="cmain">{children}</div>
        <div className="foot-row">
          <LogToggle open={open} id={did} count={logCount(op)} bang={hasError} onClick={() => setOpen(!open)} />
          {busy ? (
            <>
              <span className="hint" />
              <div className="ctl">
                <Spinner variant={busy} label={busy === "active" ? busyLabel : "waiting"} />
              </div>
            </>
          ) : (
            control
          )}
        </div>
        <LogDrawer open={open} id={did} op={op} obs={obs} />
      </div>
      <div className="fr fr-bot">
        <span className="c" aria-hidden="true">╰─</span>
        <span className="bl">{bottom}</span>
        <span className="fill" aria-hidden="true" />
        <span className="c" aria-hidden="true">─╯</span>
      </div>
    </article>
  );
}

export function LastOp({ op, now }: { op: Operation | null; now: number }) {
  if (!op) return <span className="muted">— no operations yet</span>;
  if (op.status === "in_progress") {
    return (
      <>
        <span className="op-a">{op.action}</span> <span className="run">⋯ in progress</span>{" "}
        <span className="op-t">since {hhmm(op.started_at, now)}</span>
      </>
    );
  }
  const mark = op.status === "succeeded" ? <span className="ok">✓</span>
    : op.status === "cancelled" ? <><span className="bad">✗</span> <span className="muted">cancelled</span></>
    : <span className="bad">✗</span>;
  return (
    <>
      <span className="op-a">{op.action}</span> {mark} <span className="op-t">{hhmm(op.finished_at ?? op.started_at, now)}</span>
      {op.error && <span className="op-e">{op.error}</span>}
    </>
  );
}
