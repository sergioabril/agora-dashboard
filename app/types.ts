export type OperationStatus = "in_progress" | "succeeded" | "failed" | "cancelled";

export type Operation = {
  action: string;
  status: OperationStatus;
  started_at: string;
  finished_at: string | null;
  error: string | null;
  output: string;
};

export type Active = { action: string; target: string; machines: string[] };

export type Machine = {
  name: string;
  host: string;
  user: string;
  port: number;
  key_path: string | null;
  plug_entity_id: string;
  shutdown_command: string;
  device: string;
  reachable: boolean;
  error: string | null;
  checked_at: string;
  shutdown_requested: boolean;
  operation: Operation | null;
};

export type DeploymentState = "starting" | "running" | "stopping" | "stopped";

export type Deployment = {
  name: string;
  machines: string[];
  head: string;
  start_command: string;
  stop_command: string;
  endpoint: string;
  observed_state: DeploymentState;
  ready: boolean;
  error: string | null;
  checked_at: string;
  operation: Operation | null;
};

export type SavedDeployment = { id: string; name: string; machines: string[]; head: string; start_command: string; stop_command: string; endpoint: string };

export type LogLine = { source: "hub" | "stdout" | "stderr"; text: string; at: string };
export type StreamEvent = { type: "operation" | "end"; operation: Operation } | ({ type: "line" } & LogLine);
// `op` is the stream's operation: the first event's, then the `end` event's.
export type DeploymentLog = { startedAt: string; lines: LogLine[]; open: boolean; own: boolean; op: Operation };

export type AddedMachine = {
  id: string;
  name: string;
  host: string;
  user: string;
  port: number;
  key_path: string | null;
  shutdown_command: string;
  plug_entity_id: string;
  device: string;
};

export type LoginTest = { reachable: boolean; error: string | null };

export type HomeAssistantSettings = { host: string; port: number; token: string; power_cycle_delay_seconds: number };
export type HomeAssistantChanges = { host?: string; port?: number | string; token?: string };
export type HomeAssistantSwitch = { entity_id: string; name: string; state: string; machines: string[] };

export type MachinesStatus = { machines: Record<string, Machine>; active: Active | null };
export type DeploymentsStatus = { deployments: Record<string, Deployment>; active: Active | null };

export type MachineAction = "on" | "off";
export type DeploymentAction = "start" | "stop";

export type HubErrorKind = "offline" | "timeout" | "unauthorized" | "conflict" | "not_found" | "invalid";

export type HubError = {
  kind: HubErrorKind;
  status: number | null;
  message: string;
  code?: string;
  blocking?: Record<string, unknown> | null;
};

export type HubResult<T> = { ok: true; data: T } | { ok: false; error: HubError };
