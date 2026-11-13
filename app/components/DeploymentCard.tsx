import { useRef, useState } from "react";
import { ago } from "../format";
import { actionLabel, deploymentDisplay, deploymentFailed, deploymentOn, machineDisplay, withLog } from "../model";
import type { Active, Deployment, DeploymentLog, Machine } from "../types";
import { DeploymentDialog } from "./AddDeployment";
import { useDialog } from "./AddMachine";
import { Topology } from "./AsciiArt";
import { CardFrame, LastOp, type Busy } from "./Card";
import { Led, Status } from "./Led";
import { Switch } from "./Switch";

type Props = {
  id: string;
  deployment: Deployment;
  machines: Record<string, Machine>;
  active: Active | null;
  log: DeploymentLog | undefined;
  openOn: number | undefined;
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

function CopyButton({ text, label }: { text: string; label: string }) {
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

export function DeploymentCard({ id, deployment, machines, active, log, openOn, busy, disabled, now, index, onToggle }: Props) {
  const d = withLog(deployment, log);
  const failed = deploymentFailed(d, log);
  const display = deploymentDisplay(d, failed);
  const same = log && log.startedAt === d.operation?.started_at ? log : null;
  const art = useRef<HTMLButtonElement>(null);
  const dlg = useDialog(art);
  const locked = disabled || active?.target === id || d.operation?.status === "in_progress";
  const tones = Object.fromEntries(
    d.machines.map((mid) => {
      const md = machines[mid] ? machineDisplay(machines[mid]) : null;
      return [mid, { tone: md?.led ?? "dim", pulse: md?.pulse ?? false }] as const;
    }),
  );
  return (
    <>
      <CardFrame
        id={`d-${id}`}
        title={<><span className="pre">svc/</span><b>{id}</b></>}
        status={<Status tone={display.led} pulse={display.pulse} label={display.label} />}
        bottom={`checked ${ago(d.checked_at, now)}`}
        busy={busy}
        index={index}
        failed={failed}
        openOn={openOn}
        op={same?.op ?? d.operation}
        lines={same?.lines ?? null}
        live={Boolean(same?.open)}
        hasError={Boolean((same?.op ?? d.operation)?.error)}
        obs={{
          checkedAt: d.checked_at,
          // A failing probe is expected while not running, so it is a plain row, not a red error.
          rows: [["observed", d.observed_state], ["ready", d.ready ? "yes" : "no"], ...(d.error ? [["probe", d.error] as [string, string]] : [])],
          errors: [],
          okNote: d.ready ? "/models answered 2xx" : undefined,
        }}
        busyLabel={active ? actionLabel(active.action) : "sending"}
        control={
            <Switch on={deploymentOn(d)} disabled={disabled} label={`Deployment ${id}`} holdLabel="hold to stop" tapLabel="tap to start" onToggle={onToggle} />
        }
      >
        <div className="d-head">
          <button ref={art} type="button" className="eda" disabled={locked} aria-haspopup="dialog" aria-expanded={dlg.open} aria-label={`Edit deployment ${d.name}`}
            onClick={() => dlg.setOpen(true)}>
            <Topology machines={d.machines} head={d.head} tones={tones} live={d.observed_state === "running" && d.ready} />
            <span className="eda-ov" aria-hidden="true">[ edit ]</span>
          </button>
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
        {d.models.length > 0 && (
          <div className="mdl" role="group" aria-label={`Served model${d.models.length > 1 ? "s" : ""}`}>
            <span className="mdl-l"><Led tone="green" pulse />{d.models.length > 1 ? "models" : "model"}</span>
            {d.models.map((m) => (
              <span key={m} className="mdl-r">
                <span className="mdl-id">{m}</span>
                <CopyButton text={m} label={`Copy model id ${m}`} />
              </span>
            ))}
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
        </dl>
      </CardFrame>
      <DeploymentDialog dlg={dlg} machines={machines} id={id} deployment={d} />
    </>
  );
}
