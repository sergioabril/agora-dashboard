import { useRef, useState } from "react";
import { ago } from "../format";
import { actionLabel, deploymentDisplay, deploymentOn, machineDisplay } from "../model";
import type { Active, Deployment, Machine } from "../types";
import { Topology } from "./AsciiArt";
import { CardFrame, LastOp, type Busy } from "./Card";
import { Led, Status } from "./Led";
import { Switch } from "./Switch";

type Props = {
  id: string;
  deployment: Deployment;
  machines: Record<string, Machine>;
  active: Active | null;
  busy: Busy;
  disabled: boolean;
  now: number;
  index?: number;
  onToggle: (next: boolean) => void;
};

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {}
  ta.remove();
  return ok;
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<null | boolean>(null);
  const ref = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  async function onClick() {
    const ok = await copyText(text);
    ref.current?.focus({ preventScroll: true });
    setState(ok);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState(null), 1600);
  }
  return (
    <button ref={ref} type="button" className={`copy${state ? " done" : ""}`} aria-label={label} onClick={onClick}>
      {state === null ? "⎘ copy" : state ? "✓ copied" : "✗ copy failed"}
    </button>
  );
}

export function DeploymentCard({ id, deployment: d, machines, active, busy, disabled, now, index, onToggle }: Props) {
  const display = deploymentDisplay(d);
  const tones = Object.fromEntries(
    d.machines.map((mid) => {
      const md = machines[mid] ? machineDisplay(machines[mid]) : null;
      return [mid, { tone: md?.led ?? "dim", pulse: md?.pulse ?? false }] as const;
    }),
  );
  return (
    <CardFrame
      id={`d-${id}`}
      title={<><span className="pre">svc/</span><b>{id}</b></>}
      status={<Status tone={display.led} pulse={display.pulse} label={display.label} />}
      bottom={`checked ${ago(d.checked_at, now)}`}
      busy={busy}
      index={index}
      op={d.operation}
      hasError={Boolean(d.errors.length || d.operation?.error)}
      obs={{
        checkedAt: d.checked_at,
        rows: [["observed", d.observed_state], ["script", d.script_state ?? "n/a"], ["ready", d.ready ? "yes" : "no"]],
        errors: d.errors,
      }}
      busyLabel={active ? actionLabel(active.action) : "sending"}
      control={
          <Switch on={deploymentOn(d)} disabled={disabled} label={`Deployment ${id}`} holdLabel="hold to stop" tapLabel="tap to start" onToggle={onToggle} />
      }
    >
      <div className="d-head">
        <Topology machines={d.machines} head={d.head} tones={tones} live={d.observed_state === "running" && d.ready} />
        <div className="d-id">
          <div className="d-name">
            {d.name}
            {d.ready ? <span className="badge-ready">READY</span> : d.observed_state !== "stopped" && <span className="badge-nr">NOT READY</span>}
          </div>
          <div className="ep">
            <span className="ep-url">{d.endpoint}</span>
            <CopyButton text={d.endpoint} label="Copy endpoint URL" />
          </div>
        </div>
      </div>
      {d.discrepancy && (
        <div className="warn" role="note">
          <b>⚠</b>
          <div>
            <b>discrepancy</b>{" "}
            <span>
              · status script says <b>{d.script_state ?? "n/a"}</b>, readiness probe says <b>{d.ready ? "ready" : "not ready"}</b>
            </span>
          </div>
        </div>
      )}
      <dl className="kv">
        <dt>nodes</dt>
        <dd className="chips">
          {d.machines.length ? (
            d.machines.map((mid) => (
              <span key={mid} className={`chip node${mid === d.head ? " head" : ""}`}>
                <Led tone={tones[mid].tone} pulse={tones[mid].pulse} />
                {machines[mid]?.name ?? mid}
                {mid === d.head && <span className="r">HEAD</span>}
              </span>
            ))
          ) : (
            <span className="chip none">none</span>
          )}
        </dd>
        <dt>last</dt>
        <dd>
          <LastOp op={d.operation} now={now} />
        </dd>
        {d.errors.length > 0 && (
          <>
            <dt>errors</dt>
            <dd>
              <ul className="errs">
                {d.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </dd>
          </>
        )}
      </dl>
    </CardFrame>
  );
}
