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
const SHUTDOWN = "sudo -S -p '' poweroff";
const DEFAULTS = { port: 22, key_path: null, shutdown_command: SHUTDOWN, device: "dgx-spark" };
for (const [id, m] of Object.entries(machines)) Object.assign(m, { user: "agora", port: 22, key_path: null, plug_entity_id: `switch.${id.replace(/-/g, "_")}`, shutdown_command: SHUTDOWN, password: "agora" });
const seed = (operation, lines) => lines.map(([source, text], i) =>
  ({ type: "line", source, text, at: new Date(Date.parse(operation.started_at) + i * 1500).toISOString() }));
const deployment = (name, machineIds, endpoint, ready, operation, log, start = `/home/agora/${name.toLowerCase()}/start.sh`) => ({
  name, machines: machineIds, head: machineIds[0], start_command: start, stop_command: `/home/agora/${name.toLowerCase()}/stop.sh`,
  endpoint, ready, operation, log: operation ? seed(operation, log) : [], followers: new Set(),
});
const proStop = op("stop", "succeeded", 3 * H, 14e3);
const flashStart = op("start", "succeeded", 4.5 * H, 412e3);
const visionStart = op("start", "failed", 2 * H, 180e3, "unavailable machines: rtx-1");
const deployments = {
  pro: deployment("Pro", ["spark-1", "spark-2", "spark-3", "spark-4"], "http://spark-1.local:8000/v1/models", false, proStop, [
    ["hub", "running /home/agora/pro/stop.sh on spark-1"], ["stdout", "[stop] sending SIGTERM to ray head"], ["stdout", "[stop] workers drained (3/3)"], ["hub", "exited 0"]]),
  flash: deployment("Flash", ["spark-3", "spark-4"], "http://spark-3.local:8001/v1/models", true, flashStart, [
    ["hub", "running /home/agora/flash/start.sh on spark-3"], ["stdout", "[start] launching serve on spark-3 (tp=2)"], ["stdout", "[start] loading weights 100%"],
    ["hub", "exited 0"], ["hub", "waiting for http://spark-3.local:8001/v1/models"], ["hub", "ready"]]),
  vision: deployment("Vision", ["rtx-1"], "http://10.0.0.61:8000/v1/models", false, visionStart, [["hub", "waking rtx-1"]]),
  tiny: deployment("Tiny", ["spark-2"], "http://spark-2.local:8002/v1/models", false, null, [], "/home/agora/tiny/fail.sh"),
};
let active = null;

const inProgress = (d) => d.operation?.status === "in_progress";

function deploymentObservation(id) {
  const { followers, log, ready, operation, ...config } = deployments[id];
  const observed = inProgress(deployments[id]) ? (operation.action === "start" ? "starting" : "stopping") : ready ? "running" : "stopped";
  const error = ready ? null : observed === "starting" ? "http: endpoint returned HTTP 503" : "http: All connection attempts failed";
  return { ...clone(config), observed_state: observed, ready, error, checked_at: iso(), operation: clone(operation) };
}

const send = (res, event) => res.write(JSON.stringify(event) + "\n");

// Appends to the log and fans out to every open stream; `end` closes them.
function emit(d, event) {
  if (event.type === "line") d.log = [...d.log, event].slice(-2000);
  for (const res of d.followers) {
    send(res, event);
    if (event.type === "end") res.end();
  }
  if (event.type === "end") d.followers.clear();
}

// Replays the current or last operation, then follows it live until it ends.
function follow(d, res, status) {
  res.writeHead(status, { "content-type": "application/x-ndjson" });
  send(res, { type: "operation", operation: clone(d.operation) });
  d.log.forEach((l) => send(res, l));
  if (!inProgress(d)) {
    send(res, { type: "end", operation: clone(d.operation) });
    return res.end();
  }
  d.followers.add(res);
  res.on("close", () => d.followers.delete(res));
}

function finish(operation, error, output) {
  Object.assign(operation, { status: error ? "failed" : "succeeded", error, finished_at: iso(), output });
  active = null;
}

function finishDeployment(d, error) {
  finish(d.operation, error, "");
  emit(d, { type: "end", operation: clone(d.operation) });
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
  async start(id) {
    const d = deployments[id];
    const say = (source, text) => emit(d, { type: "line", source, text, at: iso() });
    for (const m of d.machines.filter((m) => !machines[m].reachable)) {
      say("hub", `waking ${m}`);
      await wait(2500);
      if (machines[m].device === "rtx6000") return finishDeployment(d, `unavailable machines: ${m}`);
      Object.assign(machines[m], { reachable: true, error: null, shutdown_requested: false });
      say("hub", `${m} is up`);
    }
    say("hub", `running ${d.start_command} on ${d.head}`);
    await wait(1200);
    if (d.start_command.includes("fail")) {
      for (const text of ["[start] launching serve on " + d.head, "[start] loading weights 1/4"]) {
        say("stdout", text);
        await wait(1200);
      }
      say("stderr", "[start] error: CUDA out of memory");
      await wait(600);
      say("hub", "exited 3");
      return finishDeployment(d, "start command exited 3");
    }
    const out = [`[start] launching serve on ${d.head} (tp=${d.machines.length})`, "[start] loading weights 1/4", "[start] loading weights 2/4",
      "[start] loading weights 3/4", "[start] loading weights 4/4", "[start] listening on :8000"];
    for (const [i, text] of out.entries()) {
      say("stdout", text);
      if (i === 1) say("stderr", "[warn] NCCL_P2P disabled, falling back to sockets");
      await wait(1500);
    }
    say("hub", "exited 0");
    say("hub", `waiting for ${d.endpoint}`);
    await wait(3500);
    d.ready = true;
    say("hub", "ready");
    finishDeployment(d, null);
  },
  async stop(id) {
    const d = deployments[id];
    const say = (source, text) => emit(d, { type: "line", source, text, at: iso() });
    say("hub", `running ${d.stop_command} on ${d.head}`);
    for (const text of [`[stop] sending SIGTERM to ${d.head}`, "[stop] done"]) {
      await wait(1500);
      say("stdout", text);
    }
    say("hub", "exited 0");
    d.ready = false;
    finishDeployment(d, null);
  },
};

const conflict = (code, message, blocking) => [409, { detail: { code, message, blocking } }];

function machineConflict(id, action) {
  const using = Object.entries(deployments).filter(([, d]) => d.machines.includes(id));
  const running = (test) => {
    const [depId, d] = using.find(([, d]) => test(d)) ?? [];
    return d && conflict("deployment_active", `machine is running deployment ${d.name}; stop it first`, { deployment: depId });
  };
  if (action === "off" && running(inProgress)) return running(inProgress);
  if (active) return conflict("busy", "another operation is active", clone(active));
  if (action === "on" && machines[id].reachable) return conflict("machine_on", "machine is already on", { machine: id });
  if (action === "off") return running((d) => d.ready);
}

function deploymentConflict(id, action) {
  if (active) return conflict("busy", "another operation is active", clone(active));
  if (action === "start" && deployments[id].ready) return conflict("deployment_active", "deployment is already running", { deployment: id });
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
// update (`id`) merges onto the stored machine, null resetting a field to its default.
function machineRequest(raw, test, id) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {}
  const b = id ? Object.fromEntries(FIELDS.filter((k) => machines[id][k] != null).map((k) => [k, machines[id][k]])) : {};
  for (const [k, v] of Object.entries(parsed && typeof parsed === "object" ? parsed : {})) v == null ? delete b[k] : (b[k] = v);
  const invalid = (at, msg) => [422, { detail: `invalid configuration at ${at}: ${msg}` }];
  const required = "Field required";
  if (!("name" in b)) return invalid("name", required);
  if (!String(b.name).trim()) return invalid("name", "String should have at least 1 character");
  if (!("host" in b)) return invalid("host", required);
  if (!/^[A-Za-z0-9.-]+$/.test(String(b.host))) return invalid("host", "String should match pattern '^[A-Za-z0-9.-]+$'");
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
  const created = !id;
  if (created) do id = crypto.randomBytes(4).toString("hex");
  while (created && machines[id]);
  const c = { ...DEFAULTS, ...b, name: String(b.name).trim(), port: Number(b.port ?? 22) };
  machines[id] ??= { reachable: true, error: null, shutdown_requested: false, operation: null };
  for (const k of FIELDS) machines[id][k] = c[k] ?? null;
  const { password, sudo_password, ...view } = c;
  return [created ? 201 : 200, { id, ...view }];
}

const DEPLOYMENT_FIELDS = ["name", "machines", "head", "start_command", "stop_command", "endpoint"];

// Mirrors POST /admin/deployments/add and /{id}/update: merge (null drops a key), validate like the hub, save.
function saveDeployment(id, raw) {
  let body;
  try {
    body = JSON.parse(raw || "{}");
  } catch {}
  if (!body || typeof body !== "object" || Array.isArray(body)) return [422, { detail: "invalid configuration at : Input should be a valid dictionary" }];
  const current = id ? deployments[id] : {};
  const d = Object.fromEntries(DEPLOYMENT_FIELDS.filter((k) => current[k] !== undefined).map((k) => [k, clone(current[k])]));
  for (const [k, v] of Object.entries(body)) v === null ? delete d[k] : (d[k] = v);
  const newId = id ?? crypto.randomBytes(4).toString("hex");
  const invalid = (at, msg) => [422, { detail: `invalid configuration at ${at}: ${msg}` }];
  const missing = DEPLOYMENT_FIELDS.find((k) => !(k in d));
  if (missing) return invalid(missing, "Field required");
  if (!String(d.name).trim()) return invalid("name", "String should have at least 1 character");
  if (!Array.isArray(d.machines)) return invalid("machines", "Input should be a valid list");
  for (const k of ["start_command", "stop_command"]) {
    if (!String(d[k]).trim().startsWith("/")) return invalid(k, "Value error, must start with an absolute path");
  }
  if (!/^https?:\/\/[^/\s]+/.test(String(d.endpoint))) return invalid("endpoint", "Input should be a valid URL, relative URL without a base");
  const extra = Object.keys(d).find((k) => !DEPLOYMENT_FIELDS.includes(k));
  if (extra) return invalid(extra, "Extra inputs are not permitted");
  const unknown = d.machines.filter((m) => !machines[m]).sort()[0];
  if (unknown) return [422, { detail: `unknown machine in ${newId}: ${unknown}` }];
  if (!d.machines.includes(d.head)) return [422, { detail: `head is not in machines for ${newId}` }];
  if (id) Object.assign(deployments[id], d);
  else deployments[newId] = { ...d, ready: false, operation: null, log: [], followers: new Set() };
  return [id ? 200 : 201, { id: newId, ...clone(d) }];
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
      out[id] = { name: m.name, host: m.host, user: m.user, port: m.port, key_path: m.key_path, plug_entity_id: m.plug_entity_id,
        shutdown_command: m.shutdown_command, device: m.device, reachable: m.reachable, error: m.error,
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
  const mUpdate = method === "POST" && path.match(/^\/admin\/machines\/([^/]+)\/update$/);
  if (mUpdate) {
    await latency();
    const id = decodeURIComponent(mUpdate[1]);
    if (!Object.hasOwn(machines, id)) return [404, { detail: "Machine not found" }];
    if (active?.machines.includes(id)) return conflict("machine_busy", "machine has an active operation", clone(active));
    return machineRequest(raw, false, id);
  }
  if (method === "POST" && path === "/admin/deployments/add") {
    await latency();
    return saveDeployment(null, raw);
  }
  const update = method === "POST" && path.match(/^\/admin\/deployments\/([^/]+)\/update$/);
  if (update) {
    await latency();
    const id = decodeURIComponent(update[1]);
    if (!Object.hasOwn(deployments, id)) return [404, { detail: "Deployment not found" }];
    if (active?.target === id || inProgress(deployments[id])) return conflict("deployment_busy", "deployment has an active operation", clone(active ?? {}));
    return saveDeployment(id, raw);
  }
  const output = method === "GET" && path.match(/^\/admin\/deployments\/([^/]+)\/output$/);
  if (output) {
    await latency();
    const d = deployments[decodeURIComponent(output[1])];
    if (!d) return [404, { detail: "Deployment not found" }];
    return d.operation ? [200, null, (res) => follow(d, res, 200)] : [404, { detail: "No operation" }];
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
  if (kind === "machines") {
    work[action](id, operation);
    return [202, clone(operation)];
  }
  store[id].log = [];
  return [202, null, (res) => {
    follow(store[id], res, 202);
    work[action](id);
  }];
}

http.createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", async () => {
    const path = new URL(req.url, "http://fake").pathname;
    const [status, body, stream] = OPEN || req.headers.authorization === `Bearer ${TOKEN}`
      ? await route(req.method, path, raw)
      : [401, { detail: "Unauthorized" }];
    console.log(`${req.method} ${path} -> ${status}`);
    if (stream) return stream(res);
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
}).listen(PORT, "127.0.0.1", () => console.log(`fake agora-hub on http://127.0.0.1:${PORT}`));
