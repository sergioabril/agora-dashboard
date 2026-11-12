import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { DEVICES, deviceLabel } from "../ascii";
import { SECRET_FIELDS } from "../live";
import type { action } from "../routes/home";
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

export function AddMachine({ disabled }: { disabled: boolean }) {
  const add = useSubmission("add-machine");
  const check = useSubmission("test-machine");
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const tile = useRef<HTMLButtonElement>(null);
  const done = useRef<HTMLButtonElement>(null);

  const added = add.data && "machine" in add.data ? add.data.machine : null;
  const failure = add.data && !add.data.ok ? add.data : null;
  const login = check.data && "login" in check.data ? check.data.login : null;
  const testError = check.data && !check.data.ok ? `${check.data.status ?? "request failed"} · ${check.data.message}` : login?.error;

  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    form.current?.querySelector<HTMLInputElement>("input[name=name]")?.focus();
  }, [open]);

  useEffect(() => {
    if (!added) return;
    for (const k of SECRET_FIELDS) {
      const el = form.current?.elements.namedItem(k);
      if (el instanceof HTMLInputElement) el.value = "";
    }
    done.current?.focus();
  }, [added]);

  function show() {
    if (open || disabled) return;
    add.reset();
    check.reset();
    setOpen(true);
  }
  function test() {
    const f = form.current;
    if (!f || check.busy || !f.reportValidity()) return;
    const fields = new FormData(f);
    fields.set("intent", "test");
    check.mark();
    void check.fetcher.submit(fields, { method: "post" });
  }
  const close = () => dialog.current?.close();
  function onClose() {
    setOpen(false);
    tile.current?.focus();
  }

  return (
    <>
      <dialog ref={dialog} className="addm" aria-labelledby="add-ttl" onClose={onClose}>
        <div className="win">
          <div className="fr fr-top">
            <span className="c" aria-hidden="true">╭─</span>
            <span className="ttl" id="add-ttl"><span className="pre">tty1 · </span><b>add host</b></span>
            <span className="fill" aria-hidden="true" />
            <button type="button" className="xbtn" aria-label="Cancel" onClick={close}>[×]</button>
            <span className="c" aria-hidden="true">─╮</span>
          </div>
          <div className="fr-body">
            <div className="win-cmd" aria-hidden="true"><Ps1 /> <span className="c2">machines --add</span></div>
            {open && (
              <add.fetcher.Form ref={form} method="post" className={`af${add.busy ? " is-sending" : ""}`} aria-busy={add.busy}
                onInput={check.reset} onSubmit={(e) => (add.busy ? e.preventDefault() : add.mark())}>
                <input type="hidden" name="intent" value="add" />
                <div className="af-grid" hidden={Boolean(added)}>
                  <Field name="name" {...TEXT} required wide />
                  <Field name="host" {...TEXT} required wide />
                  <Field name="user" {...TEXT} required />
                  <Field name="port" {...TEXT} inputMode="numeric" placeholder="22" />
                  <Field name="password" {...SECRET} aria-describedby="af-hint" />
                  <Field name="key_path" {...TEXT} aria-describedby="af-hint" />
                  <p className="af-hint w2" id="af-hint">password or key path</p>
                  <Field name="sudo_password" {...SECRET} wide />
                  <Field name="plug_entity_id" {...TEXT} required wide />
                  <label className="af-f w2">
                    <span className="af-l">device</span>
                    <select name="device" defaultValue="dgx-spark">
                      {Object.keys(DEVICES).map((d) => <option key={d} value={d}>{deviceLabel(d)}</option>)}
                    </select>
                  </label>
                  <Field name="shutdown_command" {...TEXT} placeholder="sudo -S -p '' poweroff" wide />
                </div>
                {failure && (
                  <p className="af-err" role="alert"><b>✗ {failure.status ?? "request failed"}</b> · {failure.message}</p>
                )}
                {added ? (
                  <div className="af-done">
                    <p><span className="ok">✓ 201</span> added <b className="v">{added.name}</b> <span className="muted">· id</span> <span className="v">{added.id}</span></p>
                    <div className="af-act"><button ref={done} type="button" className="btn" onClick={close}>done</button></div>
                  </div>
                ) : (
                  <>
                    {testError && <p className="af-err" role="alert"><b>✗ ssh test</b> · {testError}</p>}
                    {login && !login.error && <p className="af-ok" role="status"><b>✓ ssh test</b> · login accepted</p>}
                    <div className="af-act">
                      <button type="submit" className="btn af-go">{add.busy ? <><MonoSpin /> sending…</> : "add host"}</button>
                      <button type="button" className="btn" onClick={test}>{check.busy ? <><MonoSpin /> testing…</> : "test ssh"}</button>
                      <button type="button" className="btn ghost" onClick={close}>cancel</button>
                      <span className="af-st" role="status">{add.busy ? "POST /admin/machines/add" : check.busy ? "POST /admin/machines/test" : ""}</span>
                    </div>
                  </>
                )}
              </add.fetcher.Form>
            )}
          </div>
          <div className="fr fr-bot">
            <span className="c" aria-hidden="true">╰─</span><span className="bl">POST /admin/machines/add · esc to cancel</span>
            <span className="fill" aria-hidden="true" /><span className="c" aria-hidden="true">─╯</span>
          </div>
        </div>
      </dialog>
      <button ref={tile} type="button" className="addt" disabled={disabled} aria-haspopup="dialog" aria-expanded={open} onClick={show}>
        <span className="fr fr-top">
          <span className="c" aria-hidden="true">╭─</span><span className="ttl" aria-hidden="true">machines/new</span>
          <span className="fill" aria-hidden="true" /><span className="c" aria-hidden="true">─╮</span>
        </span>
        <span className="fr-body">
          <span className="addt-plus" aria-hidden="true">╶─┼─╴</span>
          <span className="addt-lbl">+ add host</span>
          <span className="addt-sub" aria-hidden="true">{disabled ? "hub offline" : "POST /admin/machines/add"}</span>
        </span>
        <span className="fr fr-bot">
          <span className="c" aria-hidden="true">╰─</span><span className="fill" aria-hidden="true" /><span className="c" aria-hidden="true">─╯</span>
        </span>
      </button>
    </>
  );
}
