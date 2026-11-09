import { useCallback, useEffect, useRef } from "react";
import { useRevalidator } from "react-router";
import type { ToastData } from "./components/Toast";
import type { Active, DeploymentAction, DeploymentsStatus, HubResult, MachineAction, Operation } from "./types";

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
export type Pending = ActionRequest & { since: number };

const ALLOWED: Record<Kind, readonly string[]> = { machine: ["on", "off"], deployment: ["start", "stop"] };
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

const invalid = (message: string): ActionFailure => ({ ok: false, status: 422, code: "invalid_request", message, blocking: null });

export function parseAction(fields: Record<string, unknown>): { ok: true; request: ActionRequest } | ActionFailure {
  const { kind, id, action } = fields;
  if (kind !== "machine" && kind !== "deployment") return invalid("kind must be machine or deployment");
  if (typeof id !== "string" || !SLUG.test(id)) return invalid("id must be a slug");
  if (typeof action !== "string" || !ALLOWED[kind].includes(action)) {
    return invalid(`${kind} action must be ${ALLOWED[kind].join(" or ")}`);
  }
  return { ok: true, request: { kind, id, action: action as ActionRequest["action"] } };
}

export function actionResult(r: HubResult<Operation>): ActionResult {
  if (r.ok) return { ok: true, operation: r.data };
  const e = r.error;
  return { ok: false, status: e.status, code: e.code ?? e.kind, message: e.message, blocking: e.blocking ?? null };
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
