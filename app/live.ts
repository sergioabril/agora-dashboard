import { useCallback, useEffect, useRef, useState } from "react";
import { useRevalidator } from "react-router";
import type { ToastData } from "./components/Toast";
import type {
  Active, AddedMachine, Deployment, DeploymentAction, DeploymentLog, DeploymentsStatus, HomeAssistantChanges, HomeAssistantSettings, HubError, HubResult,
  LoginTest, MachineAction, Operation, SavedDeployment, StreamEvent,
} from "./types";

export type Kind = "machine" | "deployment";
export type ActionRequest = { kind: Kind; id: string; action: MachineAction | DeploymentAction };
export type ActionFailure = {
  ok: false;
  status: number | null;
  code: string;
  message: string;
  blocking: Record<string, unknown> | null;
};
export type ActionResult = { ok: true; operation: Operation } | ActionFailure;
export type AddResult = { ok: true; machine: AddedMachine } | ActionFailure;
export type TestResult = { ok: true; login: LoginTest } | ActionFailure;
export type DeploymentResult = { ok: true; deployment: SavedDeployment } | ActionFailure;
export type Pending = ActionRequest & { since: number };

const ALLOWED: Record<Kind, readonly string[]> = { machine: ["on", "off"], deployment: ["start", "stop"] };
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export const invalid = (message: string): ActionFailure => ({ ok: false, status: 422, code: "invalid_request", message, blocking: null });

export function parseAction(fields: Record<string, unknown>): { ok: true; request: ActionRequest } | ActionFailure {
  const { kind, id, action } = fields;
  if (kind !== "machine" && kind !== "deployment") return invalid("kind must be machine or deployment");
  if (typeof id !== "string" || !SLUG.test(id)) return invalid("id must be a slug");
  if (typeof action !== "string" || !ALLOWED[kind].includes(action)) {
    return invalid(`${kind} action must be ${ALLOWED[kind].join(" or ")}`);
  }
  return { ok: true, request: { kind, id, action: action as ActionRequest["action"] } };
}

export const failure = (e: HubError): ActionFailure =>
  ({ ok: false, status: e.status, code: e.code ?? e.kind, message: e.message, blocking: e.blocking ?? null });

export function actionResult(r: HubResult<Operation>): ActionResult {
  return r.ok ? { ok: true, operation: r.data } : failure(r.error);
}

export function addResult(r: HubResult<AddedMachine>): AddResult {
  return r.ok ? { ok: true, machine: r.data } : failure(r.error);
}

export function deploymentResult(r: HubResult<SavedDeployment>): DeploymentResult {
  return r.ok ? { ok: true, deployment: r.data } : failure(r.error);
}

export function testResult(r: HubResult<LoginTest>): TestResult {
  return r.ok ? { ok: true, login: r.data } : failure(r.error);
}

export function saveResult(r: HubResult<HomeAssistantSettings>): { ok: true; settings: HomeAssistantSettings } | ActionFailure {
  return r.ok ? { ok: true, settings: r.data } : failure(r.error);
}

export function parseHomeAssistant(fields: Record<string, unknown>): HomeAssistantChanges {
  const text = (k: string) => (typeof fields[k] === "string" ? (fields[k] as string).trim() : "");
  const [host, port] = [text("host"), text("port")];
  return { ...(host && { host }), ...(port && { port: /^\d+$/.test(port) ? Number(port) : port }), token: text("token") };
}

const MACHINE_FIELDS = ["name", "host", "user", "port", "password", "key_path", "sudo_password", "plug_entity_id", "device", "shutdown_command"];
export const SECRET_FIELDS = ["password", "sudo_password"];

export type MachineFields = Record<string, string | number | null>;

// On update a blank field becomes null (the hub resets it to its default) and a blank secret is omitted (kept).
export function parseMachine(fields: Record<string, unknown>, update = false): MachineFields {
  const out: MachineFields = {};
  for (const k of MACHINE_FIELDS) {
    const raw = fields[k];
    if (typeof raw !== "string") continue;
    const v = SECRET_FIELDS.includes(k) ? raw : raw.trim();
    if (v !== "") out[k] = k === "port" && /^\d+$/.test(v) ? Number(v) : v;
    else if (update && !SECRET_FIELDS.includes(k)) out[k] = null;
  }
  return out;
}

export type DeploymentFields = Record<string, string | string[] | null>;

// Trimmed text fields; a blank one is omitted on add and sent as null on update (the hub then answers 422).
export function parseDeployment(form: FormData, update = false): DeploymentFields {
  const out: DeploymentFields = { machines: form.getAll("machines").map(String) };
  for (const k of ["name", "head", "start_command", "stop_command", "endpoint"]) {
    const v = String(form.get(k) ?? "").trim();
    if (v) out[k] = v;
    else if (update) out[k] = null;
  }
  return out;
}

// The machines checklist: the first checked machine becomes head, unchecking the head clears it, `checked` keeps row order.
export function toggleMachine(order: string[], checked: string[], head: string, id: string): { checked: string[]; head: string } {
  const on = !checked.includes(id);
  const next = order.filter((m) => (m === id ? on : checked.includes(m)));
  return { checked: next, head: on && !checked.length ? id : !on && id === head ? "" : head };
}

function describeBlocking(b: Record<string, unknown> | null): string | null {
  if (!b) return null;
  if (typeof b.target === "string") return `${b.action} ${b.target}`;
  return Object.entries(b).map(([k, v]) => `${k} ${v}`).join(" · ") || null;
}

export function toastFor(req: ActionRequest, r: ActionFailure, id: number, at: number): ToastData {
  const blocking = describeBlocking(r.blocking);
  return {
    id,
    at,
    tone: r.status === 409 ? "red" : "orange",
    status: r.status ? String(r.status) : "",
    code: r.code,
    cmd: `${req.kind}s ${req.id} --${req.action}`,
    lines: [{ v: r.message }, ...(blocking ? [{ k: "blocking →", v: blocking }] : [])],
  };
}

export function toggleAction(kind: Kind, next: boolean): ActionRequest["action"] {
  if (kind === "machine") return next ? "on" : "off";
  return next ? "start" : "stop";
}

export function pendingActive(p: Pending | null, deployments: DeploymentsStatus | null): Active | null {
  if (!p) return null;
  const machines = p.kind === "machine" ? [p.id] : deployments?.deployments[p.id]?.machines ?? [];
  return { action: p.action, target: p.id, machines };
}

// Revalidates every `intervalMs` after the last poll settled; never overlaps, pauses while hidden.
export function usePolling(intervalMs: number, busy: boolean): () => void {
  const revalidator = useRevalidator();
  const running = busy || revalidator.state !== "idle";
  const ref = useRef({ running, revalidate: revalidator.revalidate });
  ref.current = { running, revalidate: revalidator.revalidate };
  const refresh = useCallback(() => {
    if (ref.current.running) return;
    ref.current.running = true;
    void ref.current.revalidate();
  }, []);
  useEffect(() => {
    if (running) return;
    const t = setTimeout(() => !document.hidden && refresh(), intervalMs);
    return () => clearTimeout(t);
  }, [intervalMs, running, refresh]);
  useEffect(() => {
    const onVisible = () => !document.hidden && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);
  return refresh;
}

// Reads an NDJSON body; resolves true once an `end` event arrived, false if the stream ended without one.
export async function readEvents(body: ReadableStream<BufferSource>, onEvent: (e: StreamEvent) => void): Promise<boolean> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let [buf, ended] = ["", false];
  const emit = (line: string) => {
    if (!line.trim()) return;
    const e = JSON.parse(line) as StreamEvent;
    ended ||= e.type === "end";
    onEvent(e);
  };
  for (let r = await reader.read(); !r.done; r = await reader.read()) {
    const parts = (buf + r.value).split("\n");
    buf = parts.pop() ?? "";
    parts.forEach(emit);
  }
  emit(buf);
  return ended;
}

// Open GET /deployments/<id> for an operation this page has no log of yet, or whose live stream dropped.
// A status older than the log (a poll that left before our own start) never replaces it.
export function needsFollow(d: Deployment, log: DeploymentLog | undefined, posting: boolean): boolean {
  const op = d.operation;
  if (posting || !op || (log && Date.parse(op.started_at) < Date.parse(log.startedAt))) return false;
  return log?.startedAt !== op.started_at || (op.status === "in_progress" && !log.open);
}

const MAX_LINES = 2000;
const OFFLINE: ActionFailure = { ok: false, status: null, code: "offline", message: "dashboard unreachable", blocking: null };
type LogCallbacks = { accepted: (req: ActionRequest, op: Operation) => void; failed: (req: ActionRequest, r: ActionFailure) => void; ended: () => void };

export function useDeploymentLogs(deployments: DeploymentsStatus | null, callbacks: LogCallbacks) {
  const [logs, setLogs] = useState<Record<string, DeploymentLog>>({});
  const [posting, setPosting] = useState<Set<string>>(new Set());
  const [opened, setOpened] = useState<Record<string, number>>({});
  // Mirrors read synchronously, so two quick polls can't open the same stream twice.
  const ref = useRef({ logs, posting: new Set<string>(), streams: {} as Record<string, AbortController>, callbacks });
  ref.current.callbacks = callbacks;

  const run = useCallback(async (id: string, init: RequestInit, req: ActionRequest | null) => {
    const r = ref.current;
    r.streams[id]?.abort();
    const ctl = (r.streams[id] = new AbortController());
    const set = (f: (l: DeploymentLog) => DeploymentLog) => {
      if (r.streams[id] !== ctl || !r.logs[id]) return;
      r.logs = { ...r.logs, [id]: f(r.logs[id]) };
      setLogs(r.logs);
    };
    const unpost = () => {
      r.posting.delete(id);
      setPosting(new Set(r.posting));
    };
    let live = false;
    try {
      const res = await fetch(`/deployments/${encodeURIComponent(id)}`, { ...init, signal: ctl.signal });
      if (!res.body || !res.headers.get("content-type")?.includes("ndjson")) {
        const f = (await res.json()) as ActionFailure;
        if (!req) return;
        unpost();
        return r.callbacks.failed(req, f);
      }
      await readEvents(res.body, (e) => {
        if (e.type === "line") return set((l) => ({ ...l, lines: [...l.lines, { source: e.source, text: e.text, at: e.at }].slice(-MAX_LINES) }));
        if (e.type === "end") {
          set((l) => ({ ...l, end: e.operation }));
          if (live) r.callbacks.ended();
          return;
        }
        live = e.operation.status === "in_progress";
        if (!req) return;
        r.logs = { ...r.logs, [id]: { startedAt: e.operation.started_at, lines: [], open: true, own: true, end: null } };
        setLogs(r.logs);
        unpost();
        r.callbacks.accepted(req, e.operation);
      });
    } catch {
      if (req && r.posting.has(id) && r.streams[id] === ctl) {
        unpost();
        r.callbacks.failed(req, OFFLINE);
      }
    } finally {
      set((l) => ({ ...l, open: false }));
    }
  }, []);

  useEffect(() => {
    const r = ref.current;
    for (const [id, d] of Object.entries(deployments?.deployments ?? {})) {
      if (!d.operation || !needsFollow(d, r.logs[id], r.posting.has(id))) continue;
      const prev = r.logs[id];
      // A replay of our own operation (its stream dropped, or a stale poll) keeps it ours, so a failure still shows red.
      const own = prev?.startedAt === d.operation.started_at && prev.own;
      r.logs = { ...r.logs, [id]: { startedAt: d.operation.started_at, lines: [], open: true, own, end: null } };
      setLogs(r.logs);
      void run(id, {}, null);
    }
  }, [deployments, run]);

  useEffect(() => () => {
    const r = ref.current;
    Object.values(r.streams).forEach((c) => c.abort());
    r.streams = {};
    r.logs = {};
    r.posting.clear();
  }, []);

  const startStop = useCallback((id: string, action: DeploymentAction) => {
    const r = ref.current;
    setOpened((o) => ({ ...o, [id]: (o[id] ?? 0) + 1 }));
    r.posting.add(id);
    setPosting(new Set(r.posting));
    void run(id, { method: "POST", body: new URLSearchParams({ action }) }, { kind: "deployment", id, action });
  }, [run]);

  return { logs, posting, opened, startStop };
}
