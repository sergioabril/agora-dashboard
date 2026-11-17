import { useEffect, useRef, useState } from "react";
import { toggleMachine, type DeploymentResult } from "../live";
import { machineDisplay } from "../model";
import type { Deployment, DeploymentKind, Machine } from "../types";
import { AddedPanel, AddTile, DialogFrame, Field, useDialog, useSubmission, type DialogState } from "./AddMachine";
import { Status } from "./Led";
import { MonoSpin } from "./Spinner";

const TEXT = { type: "text", autoComplete: "off" } as const;
const KINDS: [DeploymentKind, string][] = [
  ["llm", "chat model · /proxy/v1 by id or as agora, and /agent/v1"],
  ["image", "image model · /proxy/v1 by id, and the /agent/v1 image tools"],
];
// Endpoint placeholder and hint per picked kind ("" = none picked yet).
const ENDPOINT: Record<DeploymentKind | "", [string, string]> = {
  "": ["http://spark-1.local:8000/v1", "OpenAI base URL agents use, usually ends in /v1 · the hub GETs <endpoint>/models; any 2xx = up"],
  llm: ["http://spark-1.local:8000/v1",
    "OpenAI base URL, usually ends in /v1 · served on the gateway as its model ids and as agora · the hub GETs <endpoint>/models; any 2xx = up"],
  image: ["http://spark-4.local:8001/v1",
    "OpenAI Images base URL, usually ends in /v1 · served on /proxy/v1 by its model ids and as the /agent/v1 image tools · the hub GETs <endpoint>/models; any 2xx = up"],
};

type Props = { dlg: DialogState; machines: Record<string, Machine>; id?: string; deployment?: Deployment };

// Add mode without `id`; edit mode prefills from the deployment's status entry.
export function DeploymentDialog({ dlg, machines, id, deployment: d }: Props) {
  const path = id ? `POST /admin/deployments/${id}/update` : "POST /admin/deployments/add";
  return (
    <DialogFrame dlg={dlg} id={`dd-ttl-${id ?? "new"}`} title={id ? "edit deployment" : "add deployment"}
      cmd={id ? `deployments ${id} --update` : "deployments --add"} foot={path}>
      <DeploymentForm dlg={dlg} machines={machines} id={id} deployment={d} path={path} />
    </DialogFrame>
  );
}

// Mounted while the dialog is open, so each open starts from the props and polls never reset what is typed.
function DeploymentForm({ dlg, machines, id, deployment: d, path }: Props & { path: string }) {
  const save = useSubmission(id ? `update-deployment:${id}` : "add-deployment");
  const [kind, setKind] = useState<DeploymentKind | "">(d?.kind ?? "");
  const [pick, setPick] = useState({ checked: d?.machines ?? [], head: d?.head ?? "" });
  const [tried, setTried] = useState(false);
  const order = Object.keys(machines);
  const result = save.data as DeploymentResult | undefined;
  const saved = result?.ok ? result.deployment : null;
  const failure = result && !result.ok ? result : null;
  const errKind = tried && !kind ? "pick a kind" : null;
  const errMachines = tried && !pick.checked.length ? "pick at least one machine" : null;
  const errHead = tried && pick.checked.length && !pick.head ? "pick a head" : null;
  const hid = `dd-${id ?? "new"}`;

  useEffect(() => {
    if (saved && id) dlg.close();
  }, [saved, id, dlg]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    setTried(true);
    const form = e.currentTarget;
    const bad = !kind ? "input[name=kind]" : !pick.checked.length ? "input[name=machines]" : !pick.head ? "select[name=head]" : null;
    if (bad) form.querySelector<HTMLElement>(bad)?.focus();
    if (save.busy || bad || !form.reportValidity()) return e.preventDefault();
    save.mark();
  }
  // ↑/↓ move between checklist rows, like a TUI list.
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const boxes = [...e.currentTarget.querySelectorAll("input")];
    const next = boxes[boxes.indexOf(e.target as HTMLInputElement) + (e.key === "ArrowDown" ? 1 : -1)];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  }

  return (
    <save.fetcher.Form method="post" noValidate className={`af${save.busy ? " is-sending" : ""}`} aria-busy={save.busy} onSubmit={onSubmit}>
      <input type="hidden" name="intent" value={id ? "update-deployment" : "add-deployment"} />
      {id && <input type="hidden" name="id" value={id} />}
      <div className="af-grid" hidden={Boolean(saved)}>
        <Field name="name" {...TEXT} required wide defaultValue={d?.name} />
        <div className="af-f w2">
          <span className="af-l" id={`${hid}-k`}>kind<i aria-hidden="true">*</i> <span className="muted">· ↑↓ choose</span></span>
          <div className="rd-list" role="radiogroup" aria-labelledby={`${hid}-k`} aria-invalid={errKind ? true : undefined}>
            {KINDS.map(([k, desc]) => (
              <label key={k} className={`rd-row ${k}`}>
                <input type="radio" className="sr" name="kind" value={k} required checked={kind === k} onChange={() => setKind(k)} />
                <span className="rd-b" aria-hidden="true" />
                <span className="rd-n">{k}</span>
                <span className="rd-d">{desc}</span>
              </label>
            ))}
          </div>
          {errKind && <p className="af-ferr" role="alert">✗ {errKind}</p>}
        </div>
        <div className="af-f w2 ck">
          <span className="af-l" id={`${hid}-m`}>machines<i aria-hidden="true">*</i> <span className="muted">· space toggles · ↑↓ move</span></span>
          <div className="ck-list" role="group" aria-labelledby={`${hid}-m`} aria-invalid={errMachines ? true : undefined} onKeyDown={onKeyDown}>
            {order.map((mid) => {
              const on = pick.checked.includes(mid);
              const md = machineDisplay(machines[mid]);
              return (
                <label key={mid} className={`ck-row${on ? " on" : ""}`}>
                  <input type="checkbox" className="sr" name="machines" value={mid} checked={on}
                    onChange={() => setPick((p) => toggleMachine(order, p.checked, p.head, mid))} />
                  <span className="ck-b" aria-hidden="true">[{on ? "x" : " "}]</span>
                  <span className="ck-n">{machines[mid].name}</span>
                  <span className="ck-h">{machines[mid].host}</span>
                  <span className="ck-s"><Status tone={md.led} pulse={md.pulse} label={md.label} /></span>
                  <span className="ck-hd">{pick.head === mid ? "◆ HEAD" : ""}</span>
                </label>
              );
            })}
          </div>
          {errMachines && <p className="af-ferr" role="alert">✗ {errMachines}</p>}
        </div>
        <label className="af-f w2 ck-head">
          <span className="af-l">head<i aria-hidden="true">*</i></span>
          <select name="head" required disabled={!pick.checked.length} value={pick.head} aria-invalid={errHead ? true : undefined}
            onChange={(e) => setPick((p) => ({ ...p, head: e.target.value }))}>
            <option value="">—</option>
            {pick.checked.map((mid) => <option key={mid} value={mid}>{machines[mid]?.name ?? mid}</option>)}
          </select>
          {errHead && <p className="af-ferr" role="alert">✗ {errHead}</p>}
        </label>
        <Field name="start_command" {...TEXT} required wide defaultValue={d?.start_command} placeholder="/home/agora/<name>/start.sh" aria-describedby={`${hid}-cmd`} />
        <Field name="stop_command" {...TEXT} required wide defaultValue={d?.stop_command} placeholder="/home/agora/<name>/stop.sh" aria-describedby={`${hid}-cmd`} />
        <p className="af-hint w2" id={`${hid}-cmd`}>absolute path, may take arguments · runs on head from the SSH user's home, stdin closed</p>
        <Field name="endpoint" type="url" autoComplete="off" required wide defaultValue={d?.endpoint} placeholder={ENDPOINT[kind][0]}
          aria-describedby={`${hid}-ep`} />
        <p className="af-hint w2" id={`${hid}-ep`}>{ENDPOINT[kind][1]}</p>
      </div>
      {failure && (
        <p className="af-err" role="alert"><b>✗ {failure.status ?? "request failed"}{failure.status === 409 && ` ${failure.code}`}</b> · {failure.message}</p>
      )}
      {saved && !id ? (
        <AddedPanel name={saved.name} id={saved.id} onDone={dlg.close} />
      ) : (
        <div className="af-act">
          <button type="submit" className="btn af-go">{save.busy ? <><MonoSpin /> sending…</> : id ? "save" : "add deployment"}</button>
          <button type="button" className="btn ghost" onClick={dlg.close}>cancel</button>
          <span className="af-st" role="status">{save.busy ? path : ""}</span>
        </div>
      )}
    </save.fetcher.Form>
  );
}

export function AddDeployment({ disabled, machines }: { disabled: boolean; machines: Record<string, Machine> }) {
  const tile = useRef<HTMLButtonElement>(null);
  const dlg = useDialog(tile);
  const none = !Object.keys(machines).length;
  return (
    <>
      <DeploymentDialog dlg={dlg} machines={machines} />
      <AddTile tile={tile} dlg={dlg} noun="deployments" label="+ add deployment" disabled={disabled || none} onClick={() => dlg.setOpen(true)}
        sub={disabled ? "hub offline" : none ? "add a host first" : "POST /admin/deployments/add"} />
    </>
  );
}
