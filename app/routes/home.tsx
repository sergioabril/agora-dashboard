import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useFetcher, useFetchers } from "react-router";
import type { Route } from "./+types/home";
import { HOME_FIG } from "../ascii";
import { AddDeployment } from "../components/AddDeployment";
import { AddMachine } from "../components/AddMachine";
import { Banner } from "../components/Banner";
import { useFirstLoad } from "../components/anim";
import { Boot, type BootResult } from "../components/Boot";
import type { Busy } from "../components/Card";
import { DeploymentCard } from "../components/DeploymentCard";
import { Header, StatusLine } from "../components/Header";
import { MachineCard } from "../components/MachineCard";
import { Panel } from "../components/Panel";
import { Ps1 } from "../components/Ps1";
import { useHub } from "../components/Rail";
import { SkeletonGrid } from "../components/Skeleton";
import { Toasts, type ToastData } from "../components/Toast";
import { addDeployment, addMachine, deploymentsStatus, machineAction, machinesStatus, testMachine, updateDeployment, updateMachine } from "../hub.server";
import {
  actionResult, addResult, deploymentResult, parseAction, parseDeployment, parseMachine, pendingActive, testResult, toastFor, toggleAction,
  useDeploymentLogs, usePolling, type ActionRequest, type ActionResult, type AddResult, type DeploymentResult, type Pending, type TestResult,
} from "../live";
import { deploymentDisplay, deploymentFailed, deploymentInvolved, hubActive, machineDisplay, machineInvolved, pollInterval, STREAM_TIMEOUT_MS } from "../model";
import type { DeploymentsStatus, HubError, HubResult, MachinesStatus } from "../types";

export function meta() {
  return [{ title: "agora · home" }];
}

export function loader() {
  const t0 = Date.now();
  const timed = <T,>(p: Promise<HubResult<T>>) => p.then((result) => ({ result, ms: Date.now() - t0 }));
  return { now: t0, machines: timed(machinesStatus()), deployments: timed(deploymentsStatus()) };
}

export async function action({ request }: Route.ActionArgs): Promise<ActionResult | AddResult | TestResult | DeploymentResult> {
  const form = await request.formData();
  const fields = Object.fromEntries(form);
  if (fields.intent === "add-deployment") return deploymentResult(await addDeployment(parseDeployment(form)));
  if (fields.intent === "update-deployment") return deploymentResult(await updateDeployment(String(fields.id), parseDeployment(form, true)));
  if (fields.intent === "add") return addResult(await addMachine(parseMachine(fields)));
  if (fields.intent === "update-machine") return addResult(await updateMachine(String(fields.id), parseMachine(fields, true)));
  if (fields.intent === "test") return testResult(await testMachine(parseMachine(fields)));
  const parsed = parseAction({ ...fields, kind: "machine" });
  if (!parsed.ok) return parsed;
  return actionResult(await machineAction(parsed.request.id, parsed.request.action as "on" | "off"));
}

type OnResult = (req: ActionRequest, r: ActionResult) => void;

function Toggle({ id, onResult, children }: { id: string; onResult: OnResult; children: (toggle: (next: boolean) => void) => ReactNode }) {
  const fetcher = useFetcher<typeof action>({ key: `machine:${id}` });
  const sent = useRef<ActionRequest | null>(null);
  useEffect(() => {
    const data = fetcher.data;
    if (data && sent.current && ("operation" in data || !data.ok)) onResult(sent.current, data);
  }, [fetcher.data, onResult]);
  return children((next) => {
    sent.current = { kind: "machine", id, action: toggleAction("machine", next) };
    void fetcher.submit(sent.current, { method: "post" });
  });
}

const names = (records: Record<string, { name: string }> | undefined) =>
  Object.fromEntries(Object.entries(records ?? {}).map(([id, r]) => [id, r.name]));

type Timed<T> = { result: HubResult<T>; ms: number };

const bootOf = <T,>(t: Timed<T>, count: (d: T) => number): BootResult =>
  t.result.ok ? { ok: true, ms: t.ms, count: count(t.result.data) } : { ok: false, error: t.result.error.message };

// A streamed loader promise rejects when the server gives up on it, and never settles when the stream
// dies (dashboard restarted mid-load): count both as a failed poll, so the page says so and keeps polling.
function settled<T>(p: Promise<Timed<T>>): Promise<Timed<T>> {
  const lost = (message: string): Timed<T> => ({ result: { ok: false, error: { kind: "offline", status: null, message } }, ms: 0 });
  return Promise.race([
    p.catch((caught: unknown) => lost(`dashboard stream broke (${(caught as Error)?.message ?? caught})`)),
    new Promise<Timed<T>>((resolve) => setTimeout(() => resolve(lost("dashboard stream stalled")), STREAM_TIMEOUT_MS + 5_000)),
  ]);
}

// The last data seen, kept across client-side navigations so coming back home shows it while it refreshes.
// Only written in effects, so the server render and hydration always start empty.
let seen: { machines: MachinesStatus | null; deployments: DeploymentsStatus | null; lastOkAt: number | null } =
  { machines: null, deployments: null, lastOkAt: null };

export default function Home({ loaderData: ld }: Route.ComponentProps) {
  const firstLoad = useFirstLoad();
  const [machines, setMachines] = useState(seen.machines);
  const [deployments, setDeployments] = useState(seen.deployments);
  const [error, setError] = useState<HubError | null>(null);
  const [lastOkAt, setLastOkAt] = useState(seen.lastOkAt);
  const [inflight, setInflight] = useState(true);
  const [boot, setBoot] = useState<{ m: BootResult; d: BootResult; done: boolean }>({ m: null, d: null, done: false });
  const [reveal, setReveal] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [now, setNow] = useState(ld.now);
  const toastId = useRef(0);
  const fetchers = useFetchers();

  useEffect(() => {
    let live = true;
    const startedAt = Date.now();
    setInflight(true);
    void Promise.all([settled(ld.machines), settled(ld.deployments)]).then(([m, d]) => {
      if (!live) return;
      if (m.result.ok) setMachines(m.result.data);
      if (d.result.ok) setDeployments(d.result.data);
      const err = !m.result.ok ? m.result.error : !d.result.ok ? d.result.error : null;
      setError(err);
      if (!err) setLastOkAt(Date.now());
      setBoot((b) => (b.done ? b : {
        m: bootOf(m, (x) => Object.keys(x.machines).length),
        d: bootOf(d, (x) => Object.keys(x.deployments).length),
        done: !err,
      }));
      setPending((p) => (p && p.since <= startedAt ? null : p));
      setInflight(false);
    });
    return () => {
      live = false;
    };
  }, [ld]);

  useEffect(() => {
    seen = { machines, deployments, lastOkAt };
  }, [machines, deployments, lastOkAt]);

  const hasData = Boolean(machines && deployments);
  const [hadData] = useState(hasData);
  useEffect(() => {
    if (!hasData || hadData) return;
    setReveal(true);
    const t = setTimeout(() => setReveal(false), 1500);
    return () => clearTimeout(t);
  }, [hasData, hadData]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const onResult = useCallback<OnResult>((req, r) => {
    if (r.ok) setPending({ ...req, since: Date.now() });
    else setToasts((ts) => [...ts, toastFor(req, r, ++toastId.current, Date.now())]);
  }, []);
  const { logs, posting, opened, startStop } = useDeploymentLogs(deployments, {
    accepted: (req, operation) => onResult(req, { ok: true, operation }), failed: onResult, ended: () => refresh(),
  });

  const sending = new Set(fetchers.filter((f) => f.state !== "idle" && f.key.startsWith("machine:")).map((f) => f.key));
  posting.forEach((id) => sending.add(`deployment:${id}`));
  const active = hubActive(machines, deployments) ?? pendingActive(pending, deployments);
  const refresh = usePolling(pollInterval(machines, deployments, sending.size > 0 || pending !== null), inflight || sending.size > 0);
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  const disabled = error !== null || !hasData;
  const busyOf = (key: string, involved: boolean): Busy =>
    sending.has(key) ? "active" : active ? (involved ? "active" : "waiting") : sending.size ? "waiting" : null;
  const op = active && (machines?.machines[active.target]?.operation ?? deployments?.deployments[active.target]?.operation);
  const startedAt = op?.status === "in_progress" ? op.started_at : pending ? new Date(pending.since).toISOString() : null;
  useHub(error ? "offline" : hasData ? "ok" : "connecting", error?.message);

  return (
    <>
      <main id="main">
        <div className={`wrap${error && hasData ? " stale" : ""}`}>
          <Header command="cd ~/home && hub status --watch" fig={HOME_FIG} label="home" refreshing={inflight} onRefresh={refresh}>
            <StatusLine machines={machines} deployments={deployments} refreshing={inflight} offline={error !== null}
              rejected={error?.kind === "unauthorized"} lastOkAt={lastOkAt} now={now} />
          </Header>
          {firstLoad && <Boot machines={boot.m} deployments={boot.d} done={boot.done} />}
          <div className="banners" aria-live="polite">
            {error?.kind === "unauthorized" && <Banner kind="rejected" />}
            {error && error.kind !== "unauthorized" && <Banner kind="offline" message={error.message} lastOkAt={lastOkAt} />}
            {active && <Banner kind="busy" active={active} startedAt={startedAt} now={now}
              machineNames={names(machines?.machines)} deploymentNames={names(deployments?.deployments)} />}
          </div>
          <Panel id="h-m" cmd="machines" noun="host" className={`grid-m${reveal ? " reveal" : ""}`}
            displays={machines && Object.values(machines.machines).map(machineDisplay)}>
            {machines && deployments
              ? <>
                  {Object.entries(machines.machines).map(([id, m], i) => (
                    <Toggle key={id} id={id} onResult={onResult}>
                      {(toggle) => (
                        <MachineCard id={id} machine={m} deployments={deployments.deployments} active={active}
                          busy={busyOf(`machine:${id}`, machineInvolved(id, active))} disabled={disabled} now={now} index={i} onToggle={toggle} />
                      )}
                    </Toggle>
                  ))}
                  <AddMachine disabled={disabled} />
                </>
              : <SkeletonGrid kind="machine" count={4} />}
          </Panel>
          <Panel id="h-d" cmd="deployments" noun="deployment" className={`grid-d${reveal ? " reveal" : ""}`}
            displays={deployments && Object.entries(deployments.deployments).map(([id, d]) => deploymentDisplay(d, deploymentFailed(d, logs[id])))}>
            {machines && deployments
              ? <>
                  {Object.entries(deployments.deployments).map(([id, d], i) => (
                    <DeploymentCard key={id} id={id} deployment={d} machines={machines.machines} active={active} log={logs[id]} openOn={opened[id]}
                      busy={busyOf(`deployment:${id}`, deploymentInvolved(id, active))} disabled={disabled} now={now} index={i + 3}
                      onToggle={(next) => startStop(id, next ? "start" : "stop")} />
                  ))}
                  <AddDeployment disabled={disabled} machines={machines.machines} />
                </>
              : <SkeletonGrid kind="deployment" count={3} />}
          </Panel>
          <footer className="foot">
            <span aria-hidden="true"><Ps1 /></span> <span className="muted">exit 0 · phosphor/tty0</span>
          </footer>
        </div>
      </main>
      <Toasts toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
