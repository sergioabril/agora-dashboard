// Dev-only fake agora-hub on :3334 (never :3333). Ports test-webs/mock.js with the real hub's error bodies.
// Home Assistant: an empty token is "not configured", a host starting with "down" is unreachable, token "wrong" gets a 401.
import crypto from "node:crypto";
import http from "node:http";

const PORT = 3334;
const TOKEN = process.env.AGORA_HUB_ADMIN_TOKEN?.trim() ?? "";
const OPEN = !TOKEN || TOKEN === "REPLACE_WITH_HUB_TOKEN";
const H = 3600e3;
const iso = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString().replace("Z", "000+00:00");
const op = (action, status, startedAgo, durationMs, error = null, output = "") => ({
  action, status, started_at: iso(startedAgo),
  finished_at: status === "in_progress" ? null : iso(startedAgo - durationMs), error, output,
});
const clone = (value) => JSON.parse(JSON.stringify(value));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const latency = () => wait(250 + Math.random() * 600);

const machines = {
  "spark-1": { name: "Spark 1", host: "spark-1.local", device: "dgx-spark", reachable: true, error: null, shutdown_requested: false,
    operation: op("on", "succeeded", 5 * H, 97e3, null, "ha: switch.spark_1 off -> on\nssh: spark-1.local:22 reachable after 91s") },
  "spark-2": { name: "Spark 2", host: "spark-2.local", device: "dgx-spark", reachable: true, error: null, shutdown_requested: false, operation: null },
  "spark-3": { name: "Spark 3", host: "192.168.1.43", device: "dgx-spark", reachable: true, error: null, shutdown_requested: false, operation: null },
  "spark-4": { name: "Spark 4", host: "spark-4.local", device: "dgx-spark", reachable: true, error: null, shutdown_requested: false, operation: null },
  "studio-1": { name: "Studio 1", host: "studio-1.local", device: "mac-studio", reachable: false, error: "connect: [Errno 64] Host is down", shutdown_requested: true,
    operation: op("off", "succeeded", 14 * H, 21e3, null, "Connection to studio-1.local closed by remote host.") },
  "rtx-1": { name: "RTX 1", host: "10.0.0.61", device: "rtx6000", reachable: false, error: "timeout: ssh connect to 10.0.0.61:22 timed out after 10s", shutdown_requested: false,
    operation: op("on", "failed", 2 * H, 180e3, "machine did not become reachable before timeout", "ha: switch.rtx_1 off -> on\nssh: waiting for 10.0.0.61:22 ...") },
};
const deployments = {
  pro: { name: "Pro", endpoint: "http://spark-1.local:8000/", machines: ["spark-1", "spark-2", "spark-3", "spark-4"], head: "spark-1",
    state: "stopped", ready: false, scripted: true,
    operation: op("stop", "succeeded", 3 * H, 14e3, null, "$ bash stop.sh\n[stop] sending SIGTERM to ray head\n[stop] workers drained (3/3)\n[stop] done") },
  flash: { name: "Flash", endpoint: "http://spark-3.local:8001/", machines: ["spark-3", "spark-4"], head: "spark-3",
    state: "running", ready: true, scripted: true,
    operation: op("start", "succeeded", 4.5 * H, 412e3, null, "$ bash start.sh\n[start] launching serve on spark-3 (tp=2)\n[start] loading weights 100%\n[start] listening on :8001") },
  vision: { name: "Vision", endpoint: "http://10.0.0.61:8000/", machines: ["rtx-1"], head: "rtx-1",
    state: "unknown", ready: false, scripted: false,
    operation: op("start", "failed", 2 * H, 180e3, "machine rtx-1 did not become reachable before timeout", "") },
};
let active = null;

const isActiveDeployment = (d) => ["starting", "running", "stopping"].includes(d.state) || d.ready;

function deploymentObservation(id) {
  const d = deployments[id];
  const headUp = machines[d.head].reachable;
  const errors = [];
  if (!d.ready) errors.push(`http: GET ${d.endpoint}v1/models failed: ${headUp ? "503 Service Unavailable" : "connection refused"}`);
  let scriptState = null;
  if (d.scripted) {
    scriptState = headUp ? d.state : "unknown";
    if (!headUp) errors.unshift(`connect: ssh ${d.head} unreachable`);
  }
  return {
    name: d.name, endpoint: d.endpoint, machines: [...d.machines], head: d.head,
    observed_state: scriptState ?? (d.ready ? "running" : "unknown"), script_state: scriptState, ready: d.ready,
    discrepancy: scriptState !== null && (scriptState === "running") !== d.ready,
    errors, checked_at: iso(), operation: clone(d.operation),
  };
}

function finish(operation, error, output) {
  Object.assign(operation, { status: error ? "failed" : "succeeded", error, finished_at: iso(), output });
  active = null;
}

const work = {
  async on(id, operation) {
    const m = machines[id];
    await wait(6500);
    if (m.device === "rtx6000") {
      return finish(operation, "machine did not become reachable before timeout", `ha: switch.${id.replace("-", "_")} off -> on\nssh: waiting for ${m.host}:22 ...`);
    }
    Object.assign(m, { reachable: true, error: null, shutdown_requested: false });
    finish(operation, null, `ha: switch.${id.replace("-", "_")} off -> on\nssh: ${m.host}:22 reachable after 63s`);
  },
  async off(id, operation) {
    const m = machines[id];
    await wait(4500);
    Object.assign(m, { reachable: false, error: "connect: [Errno 64] Host is down", shutdown_requested: true });
    finish(operation, null, `$ sudo -S -p '' poweroff\nConnection to ${m.host} closed by remote host.`);
  },
  async start(id, operation) {
    const d = deployments[id];
    const down = d.machines.filter((m) => !machines[m].reachable);
    if (down.length) {
      await wait(5000);
      for (const m of down) {
        if (machines[m].device === "rtx6000") {
          d.state = "unknown";
          return finish(operation, `machine ${m} did not become reachable before timeout`, "");
        }
        Object.assign(machines[m], { reachable: true, error: null, shutdown_requested: false });
      }
    }
    d.state = "starting";
    await wait(8000);
    Object.assign(d, { state: "running", ready: true });
    finish(operation, null, `$ bash start.sh\n[start] launching serve on ${d.head} (tp=${d.machines.length})\n[start] loading weights 100%\n[start] readiness ok: ${d.endpoint}v1/models -> 200`);
  },
  async stop(id, operation) {
    const d = deployments[id];
    d.state = "stopping";
    await wait(3500);
    Object.assign(d, { state: "stopped", ready: false });
    finish(operation, null, `$ bash stop.sh\n[stop] sending SIGTERM to ${d.head}\n[stop] done`);
  },
};

const conflict = (code, message, blocking) => [409, { detail: { code, message, blocking } }];

function machineConflict(id, action) {
  if (active) return conflict("busy", "another operation is active", clone(active));
  if (action === "on" && machines[id].reachable) return conflict("machine_on", "machine is already on", { machine: id });
  if (action === "off") {
    for (const [depId, d] of Object.entries(deployments)) {
      if (!d.machines.includes(id)) continue;
      if (isActiveDeployment(d)) return conflict("deployment_active", "deployment must be stopped first", { deployment: depId });
      if (d.state === "unknown") return conflict("deployment_state_unknown", "deployment state is unknown", { deployment: depId });
    }
  }
}

function deploymentConflict(id, action) {
  if (active) return conflict("busy", "another operation is active", clone(active));
  if (action === "start" && isActiveDeployment(deployments[id])) return conflict("deployment_active", "deployment is already active", { deployment: id });
}

function validate(raw, allowed) {
  let body;
  try {
    body = JSON.parse(raw);
  } catch (error) {
    return [{ type: "json_invalid", loc: ["body", 0], msg: "JSON decode error", input: {}, ctx: { error: error.message } }];
  }
  if (body === null || typeof body !== "object" || !("action" in body)) {
    return [{ type: "missing", loc: ["body", "action"], msg: "Field required", input: body }];
  }
  if (!allowed.includes(body.action)) {
    const expected = `'${allowed[0]}' or '${allowed[1]}'`;
    return [{ type: "literal_error", loc: ["body", "action"], msg: `Input should be ${expected}`, input: body.action, ctx: { expected } }];
  }
  return body.action;
}

const FIELDS = ["name", "host", "user", "port", "password", "key_path", "sudo_password", "plug_entity_id", "device", "shutdown_command"];
const DEVICES = ["dgx-spark", "rtx6000", "mac-studio"];

// test mirrors POST /admin/machines/test: password "wrong" is refused and a host starting with "down" is unreachable.
function machineRequest(raw, test) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {}
  const b = {};
  for (const [k, v] of Object.entries(parsed && typeof parsed === "object" ? parsed : {})) if (v != null) b[k] = v;
  const invalid = (at, msg) => [422, { detail: `invalid configuration at ${at}: ${msg}` }];
  const required = "Field required";
  if (!("name" in b)) return invalid("name", required);
  if (!String(b.name).trim()) return invalid("name", "String should have at least 1 character");
  if (!("host" in b)) return invalid("host", required);
  if (!("user" in b)) return invalid("user", required);
  if ("port" in b && !(Number.isInteger(b.port) || /^\s*[+-]?\d+\s*$/.test(String(b.port)))) {
    return invalid("port", "Input should be a valid integer, unable to parse string as an integer");
  }
  if (!("plug_entity_id" in b)) return invalid("plug_entity_id", required);
  if ("device" in b && !DEVICES.includes(b.device)) return invalid("device", "Input should be 'dgx-spark', 'rtx6000' or 'mac-studio'");
  const extra = Object.keys(b).find((k) => !FIELDS.includes(k));
  if (extra) return invalid(extra, "Extra inputs are not permitted");
  if (!("password" in b) && !("key_path" in b)) return invalid("", "Value error, password or key_path is required");
  if (test) {
    if (String(b.host).startsWith("down")) return [200, { reachable: false, error: "connect: [Errno 64] Host is down" }];
    if (b.password === "wrong") return [200, { reachable: true, error: `auth: Permission denied for user ${b.user} on host ${b.host}` }];
    return [200, { reachable: true, error: null }];
  }
  let id;
  do id = crypto.randomBytes(4).toString("hex");
  while (machines[id]);
  const m = {
    id, name: String(b.name).trim(), host: b.host, user: b.user, port: b.port == null ? 22 : Number(b.port),
    key_path: b.key_path ?? null, shutdown_command: b.shutdown_command ?? "sudo -S -p '' poweroff",
    plug_entity_id: b.plug_entity_id, device: b.device ?? "dgx-spark",
  };
  machines[id] = { name: m.name, host: m.host, device: m.device, reachable: true, error: null,
    shutdown_requested: false, operation: null };
  return [201, m];
}

const HA_DEFAULTS = { host: "homeassistant.local", port: 8123, token: "", power_cycle_delay_seconds: 5 };
const ha = { ...HA_DEFAULTS };
const e401 = (c) => `http: Client error '401 Unauthorized' for url 'http://${c.host}:${c.port}/api/'`;

// Merges like the hub's _merge (null resets, a null or "" token unsets) and validates; returns [settings] or [null, 422 body].
function mergeHa(raw) {
  let body;
  try {
    body = JSON.parse(raw || "{}");
  } catch {}
  const at = (k, msg) => [null, [422, { detail: `invalid configuration at ${k}: ${msg}` }]];
  if (!body || typeof body !== "object" || Array.isArray(body)) return at("", "Input should be a valid dictionary");
  const c = { ...ha };
  for (const [k, v] of Object.entries(body)) {
    if (!(k in HA_DEFAULTS)) return at(k, "Extra inputs are not permitted");
    c[k] = v === null ? HA_DEFAULTS[k] : v;
  }
  if (typeof c.host !== "string" || !/^[A-Za-z0-9.-]+$/.test(c.host)) return at("host", "String should match pattern '^[A-Za-z0-9.-]+$'");
  if (typeof c.port === "string" && /^\s*\d+\s*$/.test(c.port)) c.port = Number(c.port);
  if (!Number.isInteger(c.port)) return at("port", "Input should be a valid integer, unable to parse string as an integer");
  if (c.port < 1 || c.port > 65535) return at("port", c.port < 1 ? "Input should be greater than or equal to 1" : "Input should be less than or equal to 65535");
  return [c];
}

function haSwitches() {
  if (!ha.token) return [409, { detail: { code: "home_assistant_not_configured", message: "home assistant token is not set", blocking: null } }];
  if (ha.host.startsWith("down")) return [502, { detail: "http: All connection attempts failed" }];
  if (ha.token === "wrong") return [502, { detail: e401(ha) }];
  const switches = [
    { entity_id: "switch.garage", name: "Garage", state: "unavailable", machines: [] },
    { entity_id: "switch.lamp", name: "switch.lamp", state: "off", machines: [] },
    ...Object.entries(machines).map(([id, m]) => ({
      entity_id: `switch.${id.replace(/-/g, "_")}`, name: `${m.name} plug`, state: m.reachable ? "on" : "off", machines: [id],
    })),
  ];
  return [200, { switches: switches.sort((a, b) => a.entity_id.localeCompare(b.entity_id)) }];
}

async function haRoute(method, path, raw) {
  await latency();
  if (method === "GET" && path === "") return [200, { ...ha }];
  if (method === "GET" && path === "/switches") return haSwitches();
  if (method !== "POST" || (path !== "" && path !== "/test")) return [404, { detail: "Not Found" }];
  const [c, failed] = mergeHa(raw);
  if (failed) return failed;
  if (path === "") return [200, { ...Object.assign(ha, c) }];
  if (!c.token) return [200, { reachable: false, error: "not_configured: home assistant token is not set" }];
  if (c.host.startsWith("down")) return [200, { reachable: false, error: "http: All connection attempts failed" }];
  return [200, { reachable: true, error: c.token === "wrong" ? e401(c) : null }];
}

async function route(method, path, raw) {
  if (path.startsWith("/admin/integrations/homeassistant")) return haRoute(method, path.slice(33), raw);
  if (method === "GET" && path === "/admin/machines/status") {
    await latency();
    const out = {};
    for (const [id, m] of Object.entries(machines)) {
      out[id] = { name: m.name, host: m.host, device: m.device, reachable: m.reachable, error: m.error,
        checked_at: iso(), shutdown_requested: m.shutdown_requested, operation: clone(m.operation) };
    }
    return [200, { machines: out, active: clone(active) }];
  }
  if (method === "GET" && path === "/admin/deployments/status") {
    await latency();
    const out = {};
    for (const id of Object.keys(deployments)) out[id] = deploymentObservation(id);
    return [200, { deployments: out, active: clone(active) }];
  }
  if (method === "POST" && (path === "/admin/machines/add" || path === "/admin/machines/test")) {
    await latency();
    return machineRequest(raw, path.endsWith("/test"));
  }
  const match = method === "POST" && path.match(/^\/admin\/(machines|deployments)\/([^/]+)$/);
  if (!match) return [404, { detail: "Not Found" }];
  await latency();
  const kind = match[1];
  const id = decodeURIComponent(match[2]);
  const action = validate(raw, kind === "machines" ? ["on", "off"] : ["start", "stop"]);
  if (Array.isArray(action)) return [422, { detail: action }];
  const store = kind === "machines" ? machines : deployments;
  if (!Object.hasOwn(store, id)) return [404, { detail: kind === "machines" ? "Machine not found" : "Deployment not found" }];
  const blocked = kind === "machines" ? machineConflict(id, action) : deploymentConflict(id, action);
  if (blocked) return blocked;
  active = { action, target: id, machines: kind === "machines" ? [id] : [...store[id].machines] };
  const operation = store[id].operation = { action, status: "in_progress", started_at: iso(), finished_at: null, error: null, output: "" };
  work[action](id, operation);
  return [202, clone(operation)];
}

http.createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", async () => {
    const path = new URL(req.url, "http://fake").pathname;
    const [status, body] = OPEN || req.headers.authorization === `Bearer ${TOKEN}`
      ? await route(req.method, path, raw)
      : [401, { detail: "Unauthorized" }];
    console.log(`${req.method} ${path} -> ${status}`);
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
}).listen(PORT, "127.0.0.1", () => console.log(`fake agora-hub on http://127.0.0.1:${PORT}`));
