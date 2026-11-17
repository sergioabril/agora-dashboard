import { describe, expect, it } from "vitest";
import {
  deploymentDisplay, deploymentFailed, deploymentInvolved, deploymentOn, deploymentOpOutlived, machineDisplay, machineInvolved, machineOn,
  machineOpOutlived, withLog,
  gatewayHost, pollInterval, roleLabels, actionLabel, homeAssistantDisplay, switchTone, sortSwitches,
} from "../app/model";
import type { Deployment, DeploymentsStatus, Machine, MachinesStatus, Operation } from "../app/types";

const at = "2026-11-09T08:00:41.000000+00:00";
const machine = (over: Partial<Machine> = {}): Machine => ({
  name: "M", host: "h", user: "agora", port: 22, key_path: null, plug_entity_id: "switch.m", shutdown_command: "poweroff", device: "dgx-spark", reachable: true, error: null, checked_at: at, shutdown_requested: false, operation: null, ...over,
});
const deployment = (over: Partial<Deployment> = {}): Deployment => ({
  name: "Pro", kind: "llm", machines: ["spark-1", "spark-2"], head: "spark-1", start_command: "/s.sh", stop_command: "/t.sh", endpoint: "http://x/",
  observed_state: "stopped", ready: false, models: [], error: null, checked_at: at, operation: null, ...over,
});
const running = (action: string): Operation => ({ action, status: "in_progress", started_at: at, finished_at: null, error: null, output: "" });

describe("machine display", () => {
  it("maps first match wins", () => {
    expect(machineDisplay(machine({ reachable: false, operation: running("on") }))).toEqual({ led: "yellow", pulse: true, label: "powering on" });
    expect(machineDisplay(machine({ operation: running("off") })).label).toBe("shutting down");
    expect(machineDisplay(machine({ error: "auth: denied" }))).toMatchObject({ led: "red", label: "auth error" });
    expect(machineDisplay(machine())).toMatchObject({ led: "green", label: "online" });
    expect(machineDisplay(machine({ reachable: false, shutdown_requested: true }))).toMatchObject({ led: "dim", label: "off" });
    expect(machineDisplay(machine({ reachable: false, error: "timeout" }))).toMatchObject({ led: "orange", label: "offline" });
  });
  it("treats a failed operation as outlived once its goal is observed", () => {
    const failed = (action: string): Operation => ({ ...running(action), status: "failed", finished_at: at, error: "machine did not become reachable before timeout" });
    expect(machineOpOutlived(machine({ operation: failed("on") }))).toBe(true);
    expect(machineOpOutlived(machine({ operation: { ...failed("on"), status: "cancelled" } }))).toBe(true);
    expect(machineOpOutlived(machine({ reachable: false, operation: failed("on") }))).toBe(false);
    expect(machineOpOutlived(machine({ error: "auth: denied", operation: failed("on") }))).toBe(false);
    expect(machineOpOutlived(machine({ reachable: false, operation: failed("off") }))).toBe(true);
    expect(machineOpOutlived(machine({ operation: failed("off") }))).toBe(false);
    expect(machineOpOutlived(machine({ operation: { ...failed("on"), status: "succeeded", error: null } }))).toBe(false);
    expect(machineOpOutlived(machine())).toBe(false);
    expect(deploymentOpOutlived(failed("start"), deployment({ observed_state: "running", ready: true }))).toBe(true);
    expect(deploymentOpOutlived(failed("start"), deployment())).toBe(false);
    expect(deploymentOpOutlived(failed("stop"), deployment())).toBe(false);
    expect(deploymentOpOutlived(null, deployment())).toBe(false);
  });
  it("switch is on when reachable", () => {
    expect(machineOn(machine())).toBe(true);
    expect(machineOn(machine({ reachable: false }))).toBe(false);
  });
});

describe("deployment display", () => {
  it("maps every state", () => {
    expect(deploymentDisplay(deployment({ observed_state: "running", ready: true }))).toEqual({ led: "green", pulse: false, label: "running" });
    expect(deploymentDisplay(deployment({ observed_state: "starting" }))).toEqual({ led: "yellow", pulse: true, label: "starting" });
    expect(deploymentDisplay(deployment({ observed_state: "stopping" }))).toEqual({ led: "yellow", pulse: true, label: "stopping" });
    expect(deploymentDisplay(deployment())).toEqual({ led: "dim", pulse: false, label: "stopped" });
    expect(deploymentDisplay(deployment(), true)).toEqual({ led: "red", pulse: false, label: "failed" });
  });
  it("switch is on when starting or running", () => {
    expect(deploymentOn(deployment({ observed_state: "starting" }))).toBe(true);
    expect(deploymentOn(deployment({ observed_state: "running", ready: true }))).toBe(true);
    expect(deploymentOn(deployment({ observed_state: "stopping" }))).toBe(false);
    expect(deploymentOn(deployment())).toBe(false);
  });
  it("is red failed only after this page's own failed stream of the same operation, once stopped", () => {
    const op: Operation = { ...running("start"), status: "failed", error: "start command exited 3" };
    const log = { startedAt: at, lines: [], open: false, own: true, op };
    const d = deployment({ operation: op });
    expect(deploymentFailed(d, log)).toBe(true);
    expect(deploymentFailed(d, { ...log, own: false })).toBe(false);
    expect(deploymentFailed(d, { ...log, op: { ...op, status: "succeeded" } })).toBe(false);
    expect(deploymentFailed(d, { ...log, startedAt: "2026-11-09T07:00:00+00:00" })).toBe(false);
    expect(deploymentFailed(deployment({ operation: op, observed_state: "starting" }), log)).toBe(false);
    expect(deploymentFailed(d, undefined)).toBe(false);
  });
  it("takes the own stream's newer operation until a poll catches up", () => {
    const old: Operation = { ...running("start"), status: "failed", error: "start command exited 1" };
    const next = { ...running("start"), started_at: "2026-11-09T09:00:00+00:00" };
    const d = deployment({ operation: old });
    const log = { startedAt: next.started_at, lines: [], open: true, own: true, op: next };
    expect(withLog(d, log)).toMatchObject({ operation: next, observed_state: "starting" });
    expect(withLog(d, { ...log, startedAt: at, op: old })).toBe(d);
    expect(withLog(deployment({ operation: next }), log)).toEqual(deployment({ operation: next }));
    expect(withLog(d, undefined)).toBe(d);
  });
});

describe("roles, involvement and labels", () => {
  const deployments = { pro: deployment(), flash: deployment({ name: "Flash", machines: ["spark-2"], head: "spark-2" }) };
  it("derives role chips", () => {
    expect(roleLabels("spark-1", deployments)).toEqual(["HEAD · Pro"]);
    expect(roleLabels("spark-2", deployments)).toEqual(["WORKER · Pro", "HEAD · Flash"]);
    expect(roleLabels("studio-1", deployments)).toEqual(["unassigned"]);
  });
  it("detects involvement", () => {
    const active = { action: "start", target: "pro", machines: ["spark-1", "spark-2"] };
    expect(machineInvolved("spark-2", active)).toBe(true);
    expect(machineInvolved("studio-1", active)).toBe(false);
    expect(machineInvolved("spark-1", null)).toBe(false);
    expect(deploymentInvolved("pro", active)).toBe(true);
    expect(deploymentInvolved("flash", active)).toBe(false);
  });
  it("labels spinner actions", () => {
    expect(["on", "off", "start", "stop"].map(actionLabel)).toEqual(["powering on", "shutting down", "starting", "stopping"]);
  });
});

describe("polling interval", () => {
  const ms = (m: Machine, active: MachinesStatus["active"] = null): MachinesStatus => ({ machines: { a: m }, active });
  const ds = (d: Deployment): DeploymentsStatus => ({ deployments: { pro: d }, active: null, gateway: { host: null, port: 8888, agora: null, image: null } });
  it("is 15 s when idle and 3 s when busy", () => {
    expect(pollInterval(ms(machine()), ds(deployment()), false)).toBe(15000);
    expect(pollInterval(null, null, false)).toBe(15000);
    expect(pollInterval(ms(machine()), ds(deployment()), true)).toBe(3000);
    expect(pollInterval(ms(machine(), { action: "on", target: "a", machines: ["a"] }), null, false)).toBe(3000);
    expect(pollInterval(null, ds(deployment({ operation: running("stop") })), false)).toBe(3000);
  });
});

describe("gateway host", () => {
  it("keeps a remote hub's host and falls back to the page's host for a local hub", () => {
    expect(gatewayHost("http://192.168.1.20:3333", "http://x:4444/")).toBe("192.168.1.20");
    for (const hub of ["host.docker.internal", "localhost", "127.0.0.1", "[::1]"]) expect(gatewayHost(`http://${hub}:3333`, "http://[fd7a::5]:4444/")).toBe("[fd7a::5]");
  });
});

describe("home assistant display", () => {
  it("maps settings and the check to a status, and switch states to tones", () => {
    const ha = { host: "h", port: 8123, token: "t", power_cycle_delay_seconds: 5 };
    const ok = (reachable: boolean, error: string | null) => ({ ok: true as const, data: { reachable, error } });
    expect(homeAssistantDisplay({ ...ha, token: "" }, ok(true, null))).toEqual({ led: "dim", pulse: false, label: "off" });
    expect(homeAssistantDisplay(ha, "pending")).toEqual({ led: "yellow", pulse: true, label: "checking" });
    expect(homeAssistantDisplay(ha, null)).toEqual({ led: "yellow", pulse: true, label: "checking" });
    expect(homeAssistantDisplay(ha, { ok: false, error: { kind: "timeout", status: null, message: "x" } })).toEqual({ led: "orange", pulse: false, label: "unknown" });
    expect(homeAssistantDisplay(ha, ok(true, null))).toEqual({ led: "green", pulse: false, label: "online" });
    expect(homeAssistantDisplay(ha, ok(true, "http: 401"))).toEqual({ led: "red", pulse: false, label: "rejected" });
    expect(homeAssistantDisplay(ha, ok(false, "http: refused"))).toEqual({ led: "orange", pulse: false, label: "offline" });
    expect(["on", "off", "unavailable"].map(switchTone)).toEqual(["green", "dim", "orange"]);
  });
  it("sorts switches: machine plugs, then free on, free off, unavailable", () => {
    const sw = (entity_id: string, state: string, machines: string[] = []) => ({ entity_id, name: entity_id, state, machines });
    const list = [sw("a", "unavailable"), sw("b", "off"), sw("c", "on"), sw("d", "unavailable", ["m1"]), sw("e", "off", ["m2"]), sw("f", "unknown"), sw("g", "on")];
    expect(sortSwitches(list).map((s) => s.entity_id)).toEqual(["d", "e", "c", "g", "b", "a", "f"]);
  });
});
