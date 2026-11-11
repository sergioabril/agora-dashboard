import type {
  AddedMachine,
  DeploymentAction,
  DeploymentsStatus,
  HubError,
  HubResult,
  LoginTest,
  MachineAction,
  MachinesStatus,
  Operation,
} from "./types";

const TIMEOUT_MS = 25_000;

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

async function request<T>(method: "GET" | "POST", path: string, body?: object): Promise<HubResult<T>> {
  let response: Response;
  try {
    response = await fetch(config.base + path, {
      method,
      headers: {
        ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (caught) {
    const name = (caught as Error)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      return { ok: false, error: { kind: "timeout", status: null, message: `hub did not answer within ${TIMEOUT_MS / 1000}s` } };
    }
    const code = ((caught as { cause?: { code?: string } })?.cause?.code) ?? "network error";
    return { ok: false, error: { kind: "offline", status: null, message: `hub unreachable (${code})` } };
  }
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {}
  if (response.ok) return { ok: true, data: data as T };
  return { ok: false, error: classify(response.status, data) };
}

export const machinesStatus = () => request<MachinesStatus>("GET", "/admin/machines/status");

export const deploymentsStatus = () => request<DeploymentsStatus>("GET", "/admin/deployments/status");

export const machineAction = (id: string, action: MachineAction) =>
  request<Operation>("POST", `/admin/machines/${encodeURIComponent(id)}`, { action });

export const deploymentAction = (id: string, action: DeploymentAction) =>
  request<Operation>("POST", `/admin/deployments/${encodeURIComponent(id)}`, { action });

export const addMachine = (machine: Record<string, string | number>) =>
  request<AddedMachine>("POST", "/admin/machines/add", machine);

export const testMachine = (machine: Record<string, string | number>) =>
  request<LoginTest>("POST", "/admin/machines/test", machine);
