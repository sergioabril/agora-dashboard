import { useEffect, useState } from "react";
import { useRevalidator, type ShouldRevalidateFunctionArgs } from "react-router";
import type { Route } from "./+types/settings";
import { SETTINGS_FIG } from "../ascii";
import { Banner } from "../components/Banner";
import { PowerOn } from "../components/Boot";
import { Header } from "../components/Header";
import { HomeAssistantCard, type Settled } from "../components/HomeAssistant";
import { MonoSpin } from "../components/Spinner";
import { Panel } from "../components/Panel";
import { Ps1 } from "../components/Ps1";
import { Rail } from "../components/Rail";
import { SkeletonGrid } from "../components/Skeleton";
import { ago } from "../format";
import { homeAssistant, homeAssistantSwitches, saveHomeAssistant, testHomeAssistant } from "../hub.server";
import { invalid, parseHomeAssistant, saveResult, testResult } from "../live";
import { homeAssistantDisplay } from "../model";
import type { HomeAssistantSettings, HubResult } from "../types";

export function meta() {
  return [{ title: "agora · settings" }];
}

export async function loader() {
  const settings = await homeAssistant();
  const on = settings.ok && settings.data.token !== "";
  return { settings, check: on ? testHomeAssistant({}) : null, switches: on ? homeAssistantSwitches() : null };
}

export async function action({ request }: Route.ActionArgs) {
  const fields = Object.fromEntries(await request.formData());
  if (fields.intent === "save") return saveResult(await saveHomeAssistant(parseHomeAssistant(fields)));
  if (fields.intent === "test") return testResult(await testHomeAssistant(parseHomeAssistant(fields)));
  return invalid("intent must be save or test");
}

export function shouldRevalidate({ formData, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  return formData?.get("intent") === "test" ? false : defaultShouldRevalidate;
}

const BROKE = { ok: false, error: { kind: "offline", status: null, message: "dashboard stream broke" } } as const;

function useSettled<T>(p: Promise<HubResult<T>> | null): Settled<T> {
  const [state, setState] = useState<Settled<T>>({ value: p ? "pending" : null, at: null });
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, value: p ? "pending" : null }));
    p?.catch((): HubResult<T> => BROKE).then((value) => live && setState({ value, at: Date.now() }));
    return () => {
      live = false;
    };
  }, [p]);
  return state;
}

export default function Settings({ loaderData: ld }: Route.ComponentProps) {
  const revalidator = useRevalidator();
  const check = useSettled(ld.check);
  const switches = useSettled(ld.switches);
  const [last, setLast] = useState<HomeAssistantSettings | null>(ld.settings.ok ? ld.settings.data : null);
  const [lastOkAt, setLastOkAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!ld.settings.ok) return;
    setLast(ld.settings.data);
    setLastOkAt(Date.now());
  }, [ld.settings]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const error = ld.settings.ok ? null : ld.settings.error;
  const display = last && homeAssistantDisplay(last, error ? { ok: false, error } : check.value);
  const refreshing = revalidator.state !== "idle" || check.value === "pending";
  const refresh = () => revalidator.state === "idle" && void revalidator.revalidate();

  return (
    <>
      <Rail page="settings" hub={error ? "offline" : "ok"} title={error?.message} />
      <PowerOn />
      <main id="main">
        <div className={`wrap${error && last ? " stale" : ""}`}>
          <Header command="cd ~/settings && hub integrations --status" fig={SETTINGS_FIG} label="settings" refreshing={refreshing} onRefresh={refresh}>
            <b>{last ? 1 : 0}</b> integration<i>·</i>home assistant{" "}
            {display ? <span className={`stx t-${display.led}`}>{display.label}</span> : "—"}<i>·</i>
            {refreshing ? <span className="rf">checking <MonoSpin /></span>
              : display?.label === "off" ? "not configured" : <>checked {ago(check.at, now)}</>}
            {error && <><i>·</i><span className="bad">{error.kind === "unauthorized" ? "token rejected" : "hub offline"}</span></>}
          </Header>
          <div className="banners" aria-live="polite">
            {error?.kind === "unauthorized" && <Banner kind="rejected" />}
            {error && error.kind !== "unauthorized" && <Banner kind="offline" message={error.message} lastOkAt={lastOkAt} />}
          </div>
          <Panel id="s-i" cmd="integrations" noun="integration" className="grid-l" displays={display ? [display] : null}>
            {last && display
              ? <HomeAssistantCard settings={last} display={display} disabled={error !== null} checkedAt={check.at} switches={switches} now={now} />
              : <SkeletonGrid kind="machine" count={1} />}
          </Panel>
          <footer className="foot">
            <span aria-hidden="true"><Ps1 /></span> <span className="muted">exit 0 · phosphor/tty0</span>
          </footer>
        </div>
      </main>
    </>
  );
}
