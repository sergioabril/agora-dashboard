import type {
  AddedMachine,
  DeploymentAction,
  DeploymentsStatus,
  HomeAssistantChanges,
  HomeAssistantSettings,
  HomeAssistantSwitch,
  HubError,
  HubResult,
  LoginTest,
  MachineAction,
  MachinesStatus,
  Operation,
  SavedDeployment,
} from "./types";
import { HUB_TIMEOUT_MS } from "./model";
import type { DeploymentFields, MachineFields } from "./live";

function readConfig(env: NodeJS.ProcessEnv) {
  const url = env.AGORA_HUB_URL?.trim();
  const token = env.AGORA_HUB_ADMIN_TOKEN?.trim();
  let parsed: URL | null = null;
  try {
    parsed = url ? new URL(url) : null;
  } catch {}
  if (!parsed || !["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("agora-dashboard: AGORA_HUB_URL must be an http(s) URL, e.g. http://127.0.0.1:3333");
  }
  if (token && token !== "REPLACE_WITH_HUB_TOKEN" && !/^[0-9a-fA-F]{64}$/.test(token)) {
    throw new Error("agora-dashboard: AGORA_HUB_ADMIN_TOKEN must be REPLACE_WITH_HUB_TOKEN, empty, or the hub's 64-hex admin token");
  }
  return { base: parsed.href.replace(/\/+$/, ""), token: token === "REPLACE_WITH_HUB_TOKEN" ? "" : token };
}

const config = readConfig(process.env);

function detailMessage(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = detail.map((d) => {
      const loc = Array.isArray(d?.loc) ? d.loc.join(".") : "";
      return [loc, d?.msg].filter(Boolean).join(": ");
    });
    return parts.filter(Boolean).join("; ") || fallback;
  }
  if (detail && typeof detail === "object" && "message" in detail) return String(detail.message);
  return fallback;
}

function classify(status: number, body: unknown): HubError {
  const detail = (body as { detail?: unknown } | null)?.detail;
  const message = detailMessage(detail, `hub responded ${status}`);
  if (status === 401) return { kind: "unauthorized", status, message };
  if (status === 404) return { kind: "not_found", status, message };
  if (status === 409) {
    const d = (detail ?? {}) as { code?: unknown; blocking?: unknown };
    return {
      kind: "conflict",
      status,
      message,
      code: typeof d.code === "string" ? d.code : "conflict",
      blocking: (d.blocking as Record<string, unknown> | null) ?? null,
    };
  }
  return { kind: "invalid", status, message };
}

const headers = (accept: string, body?: object) => ({
  ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
  Accept: accept,
  ...(body ? { "Content-Type": "application/json" } : {}),
});

function networkError(caught: unknown): HubError {
  const name = (caught as Error)?.name;
  if (name === "TimeoutError" || name === "AbortError") {
    return { kind: "timeout", status: null, message: `hub did not answer within ${HUB_TIMEOUT_MS / 1000}s` };
  }
  const code = ((caught as { cause?: { code?: string } })?.cause?.code) ?? "network error";
  return { kind: "offline", status: null, message: `hub unreachable (${code})` };
}

const readJson = (response: Response): Promise<unknown> => response.json().catch(() => null);

async function request<T>(method: "GET" | "POST", path: string, body?: object): Promise<HubResult<T>> {
  let response: Response;
  try {
    response = await fetch(config.base + path, {
      method, headers: headers("application/json", body), body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(HUB_TIMEOUT_MS),
    });
  } catch (caught) {
    return { ok: false, error: networkError(caught) };
  }
  const data = await readJson(response);
  if (response.ok) return { ok: true, data: data as T };
  return { ok: false, error: classify(response.status, data) };
}

export type HubStream = { ok: true; status: number; body: ReadableStream<Uint8Array> } | { ok: false; error: HubError };

// An NDJSON stream: aborts with the browser request, or when the hub sends no headers within HUB_TIMEOUT_MS; the body has no timeout.
async function open(method: "GET" | "POST", path: string, body: object | undefined, signal: AbortSignal): Promise<HubStream> {
  const headersTimer = new AbortController();
  const timer = setTimeout(() => headersTimer.abort(new DOMException("no headers", "TimeoutError")), HUB_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(config.base + path, {
      method, headers: headers("application/x-ndjson", body), body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.any([signal, headersTimer.signal]),
    });
  } catch (caught) {
    return { ok: false, error: networkError(caught) };
  } finally {
    clearTimeout(timer);
  }
  if (response.ok && response.body) return { ok: true, status: response.status, body: response.body };
  return { ok: false, error: classify(response.status, await readJson(response)) };
}

export const machinesStatus = () => request<MachinesStatus>("GET", "/admin/machines/status");

export const deploymentsStatus = () => request<DeploymentsStatus>("GET", "/admin/deployments/status");

export const machineAction = (id: string, action: MachineAction) =>
  request<Operation>("POST", `/admin/machines/${encodeURIComponent(id)}`, { action });

export const deploymentStream = (id: string, action: DeploymentAction, signal: AbortSignal) =>
  open("POST", `/admin/deployments/${encodeURIComponent(id)}`, { action }, signal);

export const deploymentOutput = (id: string, signal: AbortSignal) =>
  open("GET", `/admin/deployments/${encodeURIComponent(id)}/output`, undefined, signal);

export const addMachine = (machine: MachineFields) =>
  request<AddedMachine>("POST", "/admin/machines/add", machine);

export const updateMachine = (id: string, changes: MachineFields) =>
  request<AddedMachine>("POST", `/admin/machines/${encodeURIComponent(id)}/update`, changes);

export const testMachine = (machine: MachineFields) =>
  request<LoginTest>("POST", "/admin/machines/test", machine);

export const addDeployment = (fields: DeploymentFields) => request<SavedDeployment>("POST", "/admin/deployments/add", fields);

export const updateDeployment = (id: string, changes: DeploymentFields) =>
  request<SavedDeployment>("POST", `/admin/deployments/${encodeURIComponent(id)}/update`, changes);

const HA = "/admin/integrations/homeassistant";

export const homeAssistant = () => request<HomeAssistantSettings>("GET", HA);

export const saveHomeAssistant = (changes: HomeAssistantChanges) => request<HomeAssistantSettings>("POST", HA, changes);

export const testHomeAssistant = (changes: HomeAssistantChanges) => request<LoginTest>("POST", `${HA}/test`, changes);

export const homeAssistantSwitches = () => request<{ switches: HomeAssistantSwitch[] }>("GET", `${HA}/switches`);
