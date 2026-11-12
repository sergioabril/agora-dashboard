import { useEffect, useRef, useState, type ReactNode } from "react";
import { artSegments, HOUSE_ART } from "../ascii";
import { ago, hhmmss } from "../format";
import type { ActionFailure, TestResult } from "../live";
import { sortSwitches, switchTone, type Display } from "../model";
import type { HomeAssistantSettings, HomeAssistantSwitch, HubResult } from "../types";
import { Field, useSubmission } from "./AddMachine";
import { Led, Status } from "./Led";
import { Ps1 } from "./Ps1";
import { MonoSpin } from "./Spinner";

export type Settled<T> = { value: "pending" | HubResult<T> | null; at: number | null };
type Switches = Settled<{ switches: HomeAssistantSwitch[] }>;
type SaveResult = { ok: true; settings: HomeAssistantSettings } | ActionFailure;

const PATH = "/admin/integrations/homeassistant";
const TEXT = { type: "text", autoComplete: "off" } as const;

function Ln({ no, cls = "", children }: { no?: ReactNode; cls?: string; children: ReactNode }) {
  return (
    <div className={`ln ${cls}`}>
      <span className="no">{no}</span>
      <span>{children}</span>
    </div>
  );
}

// A single-line cell; when its text overflows, useMarquee ping-pongs it to reveal the rest.
function Mq({ cls, title, children }: { cls: string; title?: string; children: ReactNode }) {
  return <span className={`mq ${cls}`} title={title}><span className="mq-t">{children}</span></span>;
}

// Flags overflowing .mq cells (data-mq) with the distance (--mq) and a duration (--mqt) giving ~30px/s.
function useMarquee(key: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const fit = () => {
      for (const box of root.querySelectorAll<HTMLElement>(".mq")) {
        const over = (box.firstElementChild as HTMLElement).offsetWidth - box.clientWidth;
        box.toggleAttribute("data-mq", over > 1);
        box.style.setProperty("--mq", `${-over}px`);
        box.style.setProperty("--mqt", `${Math.max(4, over / 9)}s`);
      }
    };
    const ro = new ResizeObserver(fit);
    ro.observe(root);
    root.querySelectorAll(".mq-t").forEach((t) => ro.observe(t));
    return () => ro.disconnect();
  }, [key]);
  return ref;
}

function SwitchLines({ switches }: { switches: Switches }) {
  const r = switches.value;
  const list = r && r !== "pending" && r.ok ? r.data.switches : null;
  const grid = useMarquee(list);
  if (r === "pending" || r === null) return <Ln no={<MonoSpin />} cls="cm">loading switches</Ln>;
  if (!r.ok) return <Ln no="!" cls="er">{r.error.status ?? "request failed"} · {r.error.message}</Ln>;
  if (!list?.length) return <Ln no="#" cls="cm">no switch.* entities in home assistant</Ln>;
  return (
    <>
      <Ln no="#" cls="cm">switches · {list.length} · {hhmmss(switches.at)}</Ln>
      <div className="sw-list" ref={grid}>
        {sortSwitches(list).map((s) => (
          <div key={s.entity_id} className="sw-row">
            <span className="sw-l"><Led tone={switchTone(s.state)} /></span>
            <Mq cls="sw-n" title={s.name}>{s.name}</Mq>
            <Mq cls="sw-e" title={s.entity_id}>{s.entity_id}</Mq>
            {s.machines.length > 0 && (
              <Mq cls="sw-m" title={s.machines.join(", ")}>
                {s.machines.map((m) => <span key={m} className="chip"><span className="g">◇</span>{m}</span>)}
              </Mq>
            )}
            <span className={`sw-s t-${switchTone(s.state)}`}>{s.state}</span>
          </div>
        ))}
      </div>
    </>
  );
}

type Props = { settings: HomeAssistantSettings; display: Display; disabled: boolean; checkedAt: number | null; switches: Switches; now: number };

export function HomeAssistantCard({ settings, display: d, disabled, checkedAt, switches, now }: Props) {
  const save = useSubmission("save-homeassistant");
  const check = useSubmission("test-homeassistant");
  const [open, setOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const box = useRef<HTMLButtonElement>(null);

  const saved = save.data as SaveResult | undefined;
  const failure = saved && !saved.ok ? saved : null;
  const tested = check.data as TestResult | undefined;
  const login = tested?.ok ? tested.login : null;
  const testError = tested && !tested.ok ? `${tested.status ?? "request failed"} · ${tested.message}` : login?.error;
  const set = settings.token !== "";
  const online = d.label === "online";
  const count = switches.value && switches.value !== "pending" && switches.value.ok ? `[${switches.value.data.switches.length}]` : "";

  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    form.current?.querySelector<HTMLInputElement>("input[name=host]")?.focus();
  }, [open]);

  useEffect(() => {
    if (saved?.ok) dialog.current?.close();
  }, [saved]);

  function show() {
    if (open || disabled) return;
    save.reset();
    check.reset();
    setOpen(true);
  }
  function test() {
    const f = form.current;
    if (!f || check.busy) return;
    const fields = new FormData(f);
    fields.set("intent", "test");
    check.mark();
    void check.fetcher.submit(fields, { method: "post" });
  }
  const close = () => dialog.current?.close();
  function onClose() {
    setOpen(false);
    box.current?.focus();
  }

  return (
    <>
      <dialog ref={dialog} className="addm" aria-labelledby="ha-ttl" onClose={onClose}>
        <div className="win">
          <div className="fr fr-top">
            <span className="c" aria-hidden="true">╭─</span>
            <span className="ttl" id="ha-ttl"><span className="pre">tty1 · </span><b>home assistant</b></span>
            <span className="fill" aria-hidden="true" />
            <button type="button" className="xbtn" aria-label="Close" onClick={close}>[×]</button>
            <span className="c" aria-hidden="true">─╮</span>
          </div>
          <div className="fr-body">
            <div className="win-cmd" aria-hidden="true"><Ps1 /> <span className="c2">integrations homeassistant --edit</span></div>
            {open && (
              <save.fetcher.Form ref={form} method="post" className={`af${save.busy ? " is-sending" : ""}`} aria-busy={save.busy}
                onInput={check.reset} onSubmit={(e) => (save.busy ? e.preventDefault() : save.mark())}>
                <input type="hidden" name="intent" value="save" />
                <div className="af-grid">
                  <Field name="host" {...TEXT} wide defaultValue={set ? settings.host : ""} placeholder={set ? undefined : settings.host} />
                  <Field name="port" {...TEXT} inputMode="numeric" placeholder="8123" defaultValue={set ? String(settings.port) : ""} />
                  <Field name="token" type="password" autoComplete="off" wide defaultValue={settings.token} aria-describedby="ha-hint" />
                  <p className="af-hint w2" id="ha-hint">long-lived access token · empty = off</p>
                </div>
                {failure && <p className="af-err" role="alert"><b>✗ {failure.status ?? "request failed"}</b> · {failure.message}</p>}
                {testError && <p className="af-err" role="alert"><b>✗ test</b> · {testError}</p>}
                {login && !login.error && <p className="af-ok" role="status"><b>✓ test</b> · home assistant answered</p>}
                <div className="af-act">
                  <button type="submit" className="btn af-go">{save.busy ? <><MonoSpin /> sending…</> : "save"}</button>
                  <button type="button" className="btn" onClick={test}>{check.busy ? <><MonoSpin /> testing…</> : "test"}</button>
                  <button type="button" className="btn ghost" onClick={close}>close</button>
                  <span className="af-st" role="status">{save.busy ? `POST ${PATH}` : check.busy ? `POST ${PATH}/test` : ""}</span>
                </div>
              </save.fetcher.Form>
            )}
          </div>
          <div className="fr fr-bot">
            <span className="c" aria-hidden="true">╰─</span><span className="bl">POST {PATH} · esc to close</span>
            <span className="fill" aria-hidden="true" /><span className="c" aria-hidden="true">─╯</span>
          </div>
        </div>
      </dialog>
      <article className={`card hal${online && drawer ? " open" : ""}`}>
        <div className="fr fr-top">
          <span className="c" aria-hidden="true">╭─</span>
          <span className="ttl"><span className="pre">integrations/</span>homeassistant</span>
          <span className="fill" aria-hidden="true" /><span className="c" aria-hidden="true">─╮</span>
        </div>
        <div className="fr-body">
          <div className="hal-row">
            <button ref={box} type="button" className={`hab t-${d.led}`} disabled={disabled} aria-haspopup="dialog" aria-expanded={open} onClick={show}>
              <pre className="art" data-dev="homeassistant" aria-hidden="true">
                {artSegments(HOUSE_ART).map((segs, i) => (
                  <span key={i}>{i > 0 && "\n"}{segs.map((s, j) => (s.cls ? <span key={j} className={s.cls}>{s.text}</span> : s.text))}</span>
                ))}
              </pre>
              <span className="hal-id">
                <b>home assistant</b>
                <span className="muted">{set ? `${settings.host}:${settings.port}` : `not configured · ${settings.host}`}</span>
              </span>
              <Status tone={d.led} pulse={d.pulse} label={d.label} />
              <span className="muted">{!set ? "not configured" : d.label === "checking" ? "checking…" : `checked ${ago(checkedAt, now)}`}</span>
              <span className="hal-go">{disabled ? "hub offline" : "configure ›"}</span>
            </button>
            {online && (
              <button type="button" className="dtg" aria-expanded={drawer} aria-controls="drw-ha" onClick={() => setDrawer(!drawer)}>
                <span aria-hidden="true">{drawer ? "▾" : "▸"}</span>switches<span className="n">{count}</span>
              </button>
            )}
          </div>
          {online && (
            <div className="drawer" id="drw-ha" inert={!drawer}>
              <div className="drawer-in"><div className="term"><SwitchLines switches={switches} /></div></div>
            </div>
          )}
        </div>
        <div className="fr fr-bot">
          <span className="c" aria-hidden="true">╰─</span><span className="bl">hub.yaml · home_assistant</span>
          <span className="fill" aria-hidden="true" /><span className="c" aria-hidden="true">─╯</span>
        </div>
      </article>
    </>
  );
}
