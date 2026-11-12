import { useRef } from "react";
import { ago } from "../format";
import { actionLabel, machineDisplay, machineInvolved, machineOn, machineRoles } from "../model";
import type { Active, Deployment, Machine } from "../types";
import { MachineDialog, useDialog } from "./AddMachine";
import { AsciiArt } from "./AsciiArt";
import { CardFrame, LastOp, type Busy } from "./Card";
import { Status } from "./Led";
import { Switch } from "./Switch";

type Props = {
  id: string;
  machine: Machine;
  deployments: Record<string, Deployment>;
  active: Active | null;
  busy: Busy;
  disabled: boolean;
  now: number;
  index?: number;
  onToggle: (next: boolean) => void;
};

function activeLabel(id: string, active: Active | null): string {
  if (!active) return "sending";
  return active.target === id ? actionLabel(active.action) : `${active.action} ${active.target}`;
}

export function MachineCard({ id, machine: m, deployments, active, busy, disabled, now, index, onToggle }: Props) {
  const display = machineDisplay(m);
  const roles = machineRoles(id, deployments);
  const on = machineOn(m);
  const art = useRef<HTMLButtonElement>(null);
  const dlg = useDialog(art);
  return (
    <>
      <CardFrame
        id={`m-${id}`}
        title={<b>{m.name}</b>}
        status={<Status tone={display.led} pulse={display.pulse} label={display.label} />}
        bottom={`checked ${ago(m.checked_at, now)}`}
        busy={busy}
        index={index}
        op={m.operation}
        hasError={Boolean(m.error || m.operation?.error)}
        obs={{
          checkedAt: m.checked_at,
          rows: [["reachable", m.reachable ? "yes" : "no"], ["shutdown_requested", m.shutdown_requested ? "yes" : "no"]],
          errors: m.error ? [m.error] : [],
          okNote: "no observation error",
        }}
        busyLabel={activeLabel(id, active)}
        control={
            <Switch
              on={on}
              disabled={disabled}
              label={`Power ${m.name}`}
              holdLabel="hold to power off"
              tapLabel="tap to power on"
              onToggle={onToggle}
            />
        }
      >
        <button ref={art} type="button" className="eda eda-machine" disabled={disabled || machineInvolved(id, active)} aria-haspopup="dialog"
          aria-expanded={dlg.open} aria-label={`Edit host ${m.name}`} onClick={() => dlg.setOpen(true)}>
          <AsciiArt device={m.device} display={display} />
          <span className="eda-ov" aria-hidden="true">[ edit ]</span>
        </button>
        <dl className="kv">
          <dt>id</dt>
          <dd>{id}</dd>
          <dt>host</dt>
          <dd className="host">{m.host}</dd>
          <dt>roles</dt>
          <dd className="chips">
            {roles.length ? (
              roles.map((r) => (
                <span key={r.deployment} className={`chip${r.role === "HEAD" ? " head" : ""}`}>
                  <span className="g">{r.role === "HEAD" ? "◆" : "◇"}</span>
                  <span className="r">{r.role}</span>· {r.name}
                </span>
              ))
            ) : (
              <span className="chip none">unassigned</span>
            )}
          </dd>
          <dt>last</dt>
          <dd>
            <LastOp op={m.operation} now={now} />
          </dd>
        </dl>
      </CardFrame>
      <MachineDialog dlg={dlg} id={id} machine={m} />
    </>
  );
}
