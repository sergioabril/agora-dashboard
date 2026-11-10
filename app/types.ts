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
  device: string;
  reachable: boolean;
  error: string | null;
  checked_at: string;
  shutdown_requested: boolean;
  operation: Operation | null;
};

export type DeploymentState = "starting" | "running" | "stopping" | "stopped" | "failed" | "unknown";

export type Deployment = {
  name: string;
  endpoint: string;
  machines: string[];
  head: string;
  observed_state: DeploymentState;
  script_state: DeploymentState | null;
  ready: boolean;
  discrepancy: boolean;
  errors: string[];
  checked_at: string;
  operation: Operation | null;
};

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
