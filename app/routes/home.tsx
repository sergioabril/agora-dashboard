import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useFetcher, useFetchers } from "react-router";
import type { Route } from "./+types/home";
import { Banner } from "../components/Banner";
import { Boot, PowerOn, type BootResult } from "../components/Boot";
import type { Busy } from "../components/Card";
import { DeploymentCard } from "../components/DeploymentCard";
import { Header } from "../components/Header";
import { MachineCard } from "../components/MachineCard";
import { Panel } from "../components/Panel";
import { Ps1 } from "../components/Ps1";
import { Rail } from "../components/Rail";
import { SkeletonGrid } from "../components/Skeleton";
import { Toasts, type ToastData } from "../components/Toast";
import { deploymentAction, deploymentsStatus, machineAction, machinesStatus } from "../hub.server";
import {
  actionResult, parseAction, pendingActive, toastFor, toggleAction, usePolling,
  type ActionRequest, type ActionResult, type Kind, type Pending,
} from "../live";
import { deploymentDisplay, deploymentInvolved, hubActive, machineDisplay, machineInvolved, pollInterval } from "../model";
import type { DeploymentsStatus, HubError, HubResult, MachinesStatus } from "../types";

export function meta() {
  return [{ title: "agora · home" }];
}

export function loader() {
  const t0 = Date.now();
  const timed = <T,>(p: Promise<HubResult<T>>) => p.then((result) => ({ result, ms: Date.now() - t0 }));
  return { now: t0, machines: timed(machinesStatus()), deployments: timed(deploymentsStatus()) };
}

export async function action({ request }: Route.ActionArgs): Promise<ActionResult> {
  const parsed = parseAction(Object.fromEntries(await request.formData()));
  if (!parsed.ok) return parsed;
  const { kind, id, action } = parsed.request;
  const r = kind === "machine" ? await machineAction(id, action as "on" | "off") : await deploymentAction(id, action as "start" | "stop");
  return actionResult(r);
}

type OnResult = (req: ActionRequest, r: ActionResult) => void;

function Toggle({ kind, id, onResult, children }: { kind: Kind; id: string; onResult: OnResult; children: (toggle: (next: boolean) => void) => ReactNode }) {
  const fetcher = useFetcher<typeof action>({ key: `${kind}:${id}` });
  const sent = useRef<ActionRequest | null>(null);
  useEffect(() => {
    if (fetcher.data && sent.current) onResult(sent.current, fetcher.data);
  }, [fetcher.data, onResult]);
  return children((next) => {
    sent.current = { kind, id, action: toggleAction(kind, next) };
    void fetcher.submit(sent.current, { method: "post" });
  });
}

const bootOf = <T,>(t: { result: HubResult<T>; ms: number }, count: (d: T) => number): BootResult =>
  t.result.ok ? { ok: true, ms: t.ms, count: count(t.result.data) } : { ok: false, error: t.result.error.message };

export default function Home({ loaderData: ld }: Route.ComponentProps) {
  const [machines, setMachines] = useState<MachinesStatus | null>(null);
  const [deployments, setDeployments] = useState<DeploymentsStatus | null>(null);
  const [error, setError] = useState<HubError | null>(null);
  const [lastOkAt, setLastOkAt] = useState<number | null>(null);
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
    void Promise.all([ld.machines, ld.deployments]).then(([m, d]) => {
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

  const hasData = Boolean(machines && deployments);
  useEffect(() => {
    if (!hasData) return;
    setReveal(true);
    const t = setTimeout(() => setReveal(false), 1500);
    return () => clearTimeout(t);
  }, [hasData]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const sending = new Set(fetchers.filter((f) => f.state !== "idle").map((f) => f.key));
  const active = hubActive(machines, deployments) ?? pendingActive(pending, deployments);
  const refresh = usePolling(pollInterval(machines, deployments, sending.size > 0 || pending !== null), inflight || sending.size > 0);

  const onResult = useCallback<OnResult>((req, r) => {
    if (r.ok) setPending({ ...req, since: Date.now() });
    else setToasts((ts) => [...ts, toastFor(req, r, ++toastId.current, Date.now())]);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  const disabled = error !== null || !hasData;
  const busyOf = (key: string, involved: boolean): Busy =>
    sending.has(key) ? "active" : active ? (involved ? "active" : "waiting") : sending.size ? "waiting" : null;
  const op = active && (machines?.machines[active.target]?.operation ?? deployments?.deployments[active.target]?.operation);
  const startedAt = op?.status === "in_progress" ? op.started_at : pending ? new Date(pending.since).toISOString() : null;

  return (
    <>
      <Rail hub={error ? "offline" : hasData ? "ok" : "connecting"} title={error?.message} />
      <PowerOn />
      <main id="main">
        <div className={`wrap${error && hasData ? " stale" : ""}`}>
          <Header machines={machines} deployments={deployments} refreshing={inflight} offline={error !== null}
            rejected={error?.kind === "unauthorized"}
            lastOkAt={lastOkAt} now={now} onRefresh={refresh} />
          <Boot machines={boot.m} deployments={boot.d} done={boot.done} />
          <div className="banners" aria-live="polite">
            {error?.kind === "unauthorized" && <Banner kind="rejected" />}
            {error && error.kind !== "unauthorized" && <Banner kind="offline" message={error.message} lastOkAt={lastOkAt} />}
            {active && <Banner kind="busy" active={active} startedAt={startedAt} now={now} />}
          </div>
          <Panel id="h-m" cmd="machines" noun="host" className={`grid-m${reveal ? " reveal" : ""}`}
            displays={machines && Object.values(machines.machines).map(machineDisplay)}>
            {machines && deployments
              ? Object.entries(machines.machines).map(([id, m], i) => (
                  <Toggle key={id} kind="machine" id={id} onResult={onResult}>
                    {(toggle) => (
                      <MachineCard id={id} machine={m} deployments={deployments.deployments} active={active}
                        busy={busyOf(`machine:${id}`, machineInvolved(id, active))} disabled={disabled} now={now} index={i} onToggle={toggle} />
                    )}
                  </Toggle>
                ))
              : <SkeletonGrid kind="machine" count={4} />}
          </Panel>
          <Panel id="h-d" cmd="deployments" noun="deployment" className={`grid-d${reveal ? " reveal" : ""}`}
            displays={deployments && Object.values(deployments.deployments).map(deploymentDisplay)}>
            {machines && deployments
              ? Object.entries(deployments.deployments).map(([id, d], i) => (
                  <Toggle key={id} kind="deployment" id={id} onResult={onResult}>
                    {(toggle) => (
                      <DeploymentCard id={id} deployment={d} machines={machines.machines} active={active}
                        busy={busyOf(`deployment:${id}`, deploymentInvolved(id, active))} disabled={disabled} now={now} index={i + 3} onToggle={toggle} />
                    )}
                  </Toggle>
                ))
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
