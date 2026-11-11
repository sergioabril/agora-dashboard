import type { Active, Deployment, DeploymentsStatus, Machine, MachinesStatus } from "./types";

export type LedColor = "green" | "yellow" | "red" | "orange" | "dim";
export type Display = { led: LedColor; pulse: boolean; label: string };

const ACTION_LABELS: Record<string, string> = {
  on: "powering on",
  wake: "powering on",
  off: "shutting down",
  shutdown: "shutting down",
  start: "starting",
  stop: "stopping",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function machineDisplay(m: Machine): Display {
  if (m.operation?.status === "in_progress") {
    return { led: "yellow", pulse: true, label: actionLabel(m.operation.action) };
  }
  if (m.reachable && m.error) return { led: "red", pulse: false, label: "auth error" };
  if (m.reachable) return { led: "green", pulse: false, label: "online" };
  if (m.shutdown_requested) return { led: "dim", pulse: false, label: "off" };
  return { led: "orange", pulse: false, label: "offline" };
}

export function deploymentDisplay(d: Deployment): Display {
  switch (d.observed_state) {
    case "running":
      return d.ready
        ? { led: "green", pulse: false, label: "running" }
        : { led: "yellow", pulse: false, label: "running · not ready" };
    case "starting":
    case "stopping":
      return { led: "yellow", pulse: true, label: d.observed_state };
    case "stopped":
      return { led: "dim", pulse: false, label: "stopped" };
    case "failed":
      return { led: "red", pulse: false, label: "failed" };
    default:
      return { led: "orange", pulse: false, label: "unknown" };
  }
}

export function machineOn(m: Machine): boolean {
  return m.reachable;
}

export function deploymentOn(d: Deployment): boolean {
  return d.observed_state === "starting" || d.observed_state === "running" || d.ready;
}

export type RoleChip = { role: "HEAD" | "WORKER"; deployment: string; name: string };

export function machineRoles(machineId: string, deployments: Record<string, Deployment>): RoleChip[] {
  const roles: RoleChip[] = [];
  for (const [id, d] of Object.entries(deployments)) {
    if (!d.machines.includes(machineId)) continue;
    roles.push({ role: d.head === machineId ? "HEAD" : "WORKER", deployment: id, name: d.name });
  }
  return roles;
}

export function roleLabels(machineId: string, deployments: Record<string, Deployment>): string[] {
  const roles = machineRoles(machineId, deployments);
  return roles.length ? roles.map((r) => `${r.role} · ${r.name}`) : ["unassigned"];
}

export function machineInvolved(machineId: string, active: Active | null): boolean {
  return Boolean(active?.machines.includes(machineId));
}

export function deploymentInvolved(deploymentId: string, active: Active | null): boolean {
  return active?.target === deploymentId;
}

export function hubActive(
  machines: MachinesStatus | null,
  deployments: DeploymentsStatus | null,
): Active | null {
  return machines?.active ?? deployments?.active ?? null;
}

export const FAST_POLL_MS = 3000;
export const IDLE_POLL_MS = 15000;
// The hub's status calls wait on SSH to every machine (~ssh_connect_seconds when one is off).
// Streamed loader data must outlast them: promises still pending at the stream timeout reach the browser rejected.
export const HUB_TIMEOUT_MS = 25_000;
export const STREAM_TIMEOUT_MS = HUB_TIMEOUT_MS + 5_000;

export function pollInterval(
  machines: MachinesStatus | null,
  deployments: DeploymentsStatus | null,
  toggleInFlight: boolean,
): number {
  if (toggleInFlight || hubActive(machines, deployments)) return FAST_POLL_MS;
  const ops = [
    ...Object.values(machines?.machines ?? {}),
    ...Object.values(deployments?.deployments ?? {}),
  ].map((x) => x.operation);
  return ops.some((op) => op?.status === "in_progress") ? FAST_POLL_MS : IDLE_POLL_MS;
}
