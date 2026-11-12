import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useFetcher } from "react-router";
import { DEVICES, deviceLabel } from "../ascii";
import { SECRET_FIELDS } from "../live";
import type { action } from "../routes/home";
import type { Machine } from "../types";
import { Ps1 } from "./Ps1";
import { MonoSpin } from "./Spinner";

const TEXT = { type: "text", autoComplete: "off" } as const;
const SECRET = { type: "password", autoComplete: "new-password" } as const;

export function Field({ name, wide, ...input }: { name: string; wide?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`af-f${wide ? " w2" : ""}`}>
      <span className="af-l">{name}{input.required && <i aria-hidden="true">*</i>}</span>
      <input name={name} {...input} />
    </label>
  );
}

// A keyed fetcher keeps its last data across opens; only data that arrived after `mark()` counts.
export function useSubmission(key: string) {
  const fetcher = useFetcher<typeof action>({ key });
  const [sent, setSent] = useState<{ base: unknown } | null>(null);
  const busy = sent !== null && fetcher.state !== "idle";
  const data = sent && !busy && fetcher.data !== sent.base ? fetcher.data : undefined;
  return { fetcher, busy, data, mark: () => setSent({ base: fetcher.data }), reset: () => setSent(null) };
}

// A modal's open state: shows it and focuses its name field on open, hands focus back to the opener on close.
export function useDialog(opener: RefObject<HTMLElement | null>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open) return;
    ref.current?.showModal();
    ref.current?.querySelector<HTMLInputElement>("input[name=name]")?.focus();
  }, [open]);
  const onClose = () => {
    setOpen(false);
    opener.current?.focus();
  };
  return { open, setOpen, ref, onClose, close: () => ref.current?.close() };
}
export type DialogState = ReturnType<typeof useDialog>;

// The `win` box frame of the add/edit dialogs: title bar with [×], command line, footer.
export function DialogFrame({ dlg, id, title, cmd, foot, children }: { dlg: DialogState; id: string; title: string; cmd: string; foot: string; children: ReactNode }) {
  return (
    <dialog ref={dlg.ref} className="addm" aria-labelledby={id} onClose={dlg.onClose}>
      <div className="win">
        <div className="fr fr-top">
          <span className="c" aria-hidden="true">╭─</span>
          <span className="ttl" id={id}><span className="pre">tty1 · </span><b>{title}</b></span>
          <span className="fill" aria-hidden="true" />
          <button type="button" className="xbtn" aria-label="Cancel" onClick={dlg.close}>[×]</button>
          <span className="c" aria-hidden="true">─╮</span>
        </div>
        <div className="fr-body">
          <div className="win-cmd" aria-hidden="true"><Ps1 /> <span className="c2">{cmd}</span></div>
          {dlg.open && children}
        </div>
        <div className="fr fr-bot">
          <span className="c" aria-hidden="true">╰─</span><span className="bl">{foot} · esc to cancel</span>
          <span className="fill" aria-hidden="true" /><span className="c" aria-hidden="true">─╯</span>
        </div>
      </div>
    </dialog>
  );
}

type TileProps = { tile: RefObject<HTMLButtonElement | null>; dlg: DialogState; noun: string; label: string; sub: string; disabled: boolean; onClick: () => void };

export function AddTile({ tile, dlg, noun, label, sub, disabled, onClick }: TileProps) {
  return (
    <button ref={tile} type="button" className="addt" disabled={disabled} aria-haspopup="dialog" aria-expanded={dlg.open} onClick={onClick}>
      <span className="fr fr-top">
        <span className="c" aria-hidden="true">╭─</span><span className="ttl" aria-hidden="true">{noun}/new</span>
        <span className="fill" aria-hidden="true" /><span className="c" aria-hidden="true">─╮</span>
      </span>
      <span className="fr-body">
        <span className="addt-plus" aria-hidden="true">╶─┼─╴</span>
        <span className="addt-lbl">{label}</span>
        <span className="addt-sub" aria-hidden="true">{sub}</span>
      </span>
      <span className="fr fr-bot">
        <span className="c" aria-hidden="true">╰─</span><span className="fill" aria-hidden="true" /><span className="c" aria-hidden="true">─╯</span>
      </span>
    </button>
  );
}

// The add-result panel shared by the add dialogs.
export function AddedPanel({ name, id, onDone }: { name: string; id: string; onDone: () => void }) {
  const done = useRef<HTMLButtonElement>(null);
  useEffect(() => done.current?.focus(), []);
  return (
    <div className="af-done">
      <p><span className="ok">✓ 201</span> added <b className="v">{name}</b> <span className="muted">· id</span> <span className="v">{id}</span></p>
      <div className="af-act"><button ref={done} type="button" className="btn" onClick={onDone}>done</button></div>
    </div>
  );
}

type DialogProps = { dlg: DialogState; id?: string; machine?: Machine };

// Add mode without `id` (the tile); edit mode prefills from the machine's status entry and has no test ssh.
export function MachineDialog({ dlg, id, machine }: DialogProps) {
  const path = id ? `POST /admin/machines/${id}/update` : "POST /admin/machines/add";
  return (
    <DialogFrame dlg={dlg} id={`mh-ttl-${id ?? "new"}`} title={id ? "edit host" : "add host"} cmd={id ? `machines ${id} --update` : "machines --add"} foot={path}>
      <MachineForm dlg={dlg} id={id} machine={machine} path={path} />
    </DialogFrame>
  );
}

// Mounted while the dialog is open, so each open starts fresh from the props.
function MachineForm({ dlg, id, machine: m, path }: DialogProps & { path: string }) {
  const add = useSubmission(id ? `update-machine:${id}` : "add-machine");
  const check = useSubmission("test-machine");
  const form = useRef<HTMLFormElement>(null);
  const hid = `mh-${id ?? "new"}`;
  const keep = id ? " · blank keeps the saved password" : "";

  const added = add.data && "machine" in add.data ? add.data.machine : null;
  const failure = add.data && !add.data.ok ? add.data : null;
  const login = check.data && "login" in check.data ? check.data.login : null;
  const testError = check.data && !check.data.ok ? `${check.data.status ?? "request failed"} · ${check.data.message}` : login?.error;

  useEffect(() => {
    if (!added) return;
    if (id) return dlg.close();
    for (const k of SECRET_FIELDS) {
      const el = form.current?.elements.namedItem(k);
      if (el instanceof HTMLInputElement) el.value = "";
    }
  }, [added, id, dlg]);

  function test() {
    const f = form.current;
    if (!f || check.busy || !f.reportValidity()) return;
    const fields = new FormData(f);
    fields.set("intent", "test");
    check.mark();
    void check.fetcher.submit(fields, { method: "post" });
  }

  return (
    <add.fetcher.Form ref={form} method="post" className={`af${add.busy ? " is-sending" : ""}`} aria-busy={add.busy}
      onInput={check.reset} onSubmit={(e) => (add.busy ? e.preventDefault() : add.mark())}>
      <input type="hidden" name="intent" value={id ? "update-machine" : "add"} />
      {id && <input type="hidden" name="id" value={id} />}
      <div className="af-grid" hidden={Boolean(added)}>
        <Field name="name" {...TEXT} required wide defaultValue={m?.name} />
        <Field name="host" {...TEXT} required wide defaultValue={m?.host} />
        <Field name="user" {...TEXT} required defaultValue={m?.user} />
        <Field name="port" {...TEXT} inputMode="numeric" placeholder="22" defaultValue={m?.port} />
        <Field name="password" {...SECRET} aria-describedby={`${hid}-pw`} />
        <Field name="key_path" {...TEXT} aria-describedby={`${hid}-pw`} defaultValue={m?.key_path ?? ""} />
        <p className="af-hint w2" id={`${hid}-pw`}>password or key path{keep}</p>
        <Field name="sudo_password" {...SECRET} wide aria-describedby={id && `${hid}-sudo`} />
        {id && <p className="af-hint w2" id={`${hid}-sudo`}>blank keeps the saved password</p>}
        <Field name="plug_entity_id" {...TEXT} required wide defaultValue={m?.plug_entity_id} />
        <label className="af-f w2">
          <span className="af-l">device</span>
          <select name="device" defaultValue={m?.device ?? "dgx-spark"}>
            {Object.keys(DEVICES).map((d) => <option key={d} value={d}>{deviceLabel(d)}</option>)}
          </select>
        </label>
        <Field name="shutdown_command" {...TEXT} placeholder="sudo -S -p '' poweroff" wide defaultValue={m?.shutdown_command} />
      </div>
      {failure && (
        <p className="af-err" role="alert"><b>✗ {failure.status ?? "request failed"}{failure.status === 409 && ` ${failure.code}`}</b> · {failure.message}</p>
      )}
      {added && !id ? (
        <AddedPanel name={added.name} id={added.id} onDone={dlg.close} />
      ) : (
        <>
          {testError && <p className="af-err" role="alert"><b>✗ ssh test</b> · {testError}</p>}
          {login && !login.error && <p className="af-ok" role="status"><b>✓ ssh test</b> · login accepted</p>}
          <div className="af-act">
            <button type="submit" className="btn af-go">{add.busy ? <><MonoSpin /> sending…</> : id ? "save" : "add host"}</button>
            {!id && <button type="button" className="btn" onClick={test}>{check.busy ? <><MonoSpin /> testing…</> : "test ssh"}</button>}
            <button type="button" className="btn ghost" onClick={dlg.close}>cancel</button>
            <span className="af-st" role="status">{add.busy ? path : check.busy ? "POST /admin/machines/test" : ""}</span>
          </div>
        </>
      )}
    </add.fetcher.Form>
  );
}

export function AddMachine({ disabled }: { disabled: boolean }) {
  const tile = useRef<HTMLButtonElement>(null);
  const dlg = useDialog(tile);
  return (
    <>
      <MachineDialog dlg={dlg} />
      <AddTile tile={tile} dlg={dlg} noun="machines" label="+ add host" sub={disabled ? "hub offline" : "POST /admin/machines/add"} disabled={disabled}
        onClick={() => dlg.setOpen(true)} />
    </>
  );
}
