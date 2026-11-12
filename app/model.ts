import type {
  Active, Deployment, DeploymentLog, DeploymentsStatus, HomeAssistantSettings, HomeAssistantSwitch, HubResult, LoginTest, Machine, MachinesStatus,
} from "./types";

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

export function homeAssistantDisplay(settings: HomeAssistantSettings, check: "pending" | HubResult<LoginTest> | null): Display {
  if (settings.token === "") return { led: "dim", pulse: false, label: "off" };
  if (check === "pending" || check === null) return { led: "yellow", pulse: true, label: "checking" };
  if (!check.ok) return { led: "orange", pulse: false, label: "unknown" };
  if (!check.data.reachable) return { led: "orange", pulse: false, label: "offline" };
  return check.data.error ? { led: "red", pulse: false, label: "rejected" } : { led: "green", pulse: false, label: "online" };
}

export const switchTone = (state: string): LedColor => (state === "on" ? "green" : state === "off" ? "dim" : "orange");

// Plugs of configured machines first, then free switches that are on, then off, then unavailable/unknown; hub order within a group.
const switchRank = (s: HomeAssistantSwitch) => (s.machines.length ? 0 : s.state === "on" ? 1 : s.state === "off" ? 2 : 3);
export const sortSwitches = (list: HomeAssistantSwitch[]) => [...list].sort((a, b) => switchRank(a) - switchRank(b));

export function deploymentDisplay(d: Deployment, failed = false): Display {
  if (d.observed_state === "running") return { led: "green", pulse: false, label: "running" };
  if (d.observed_state !== "stopped") return { led: "yellow", pulse: true, label: d.observed_state };
  return failed ? { led: "red", pulse: false, label: "failed" } : { led: "dim", pulse: false, label: "stopped" };
}

// Red "failed" only after this page's own start/stop stream ended failed and the deployment is now stopped.
export function deploymentFailed(d: Deployment, log: DeploymentLog | undefined): boolean {
  return Boolean(log?.own && log.end?.status === "failed" && log.startedAt === d.operation?.started_at && d.observed_state === "stopped");
}

export function machineOn(m: Machine): boolean {
  return m.reachable;
}

export function deploymentOn(d: Deployment): boolean {
  return d.observed_state === "starting" || d.observed_state === "running";
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
