import { describe, expect, it } from "vitest";
import {
  deploymentDisplay, deploymentInvolved, deploymentOn, machineDisplay, machineInvolved, machineOn,
  pollInterval, roleLabels, actionLabel,
} from "../app/model";
import type { Deployment, DeploymentsStatus, Machine, MachinesStatus, Operation } from "../app/types";

const at = "2026-11-09T08:00:41.000000+00:00";
const machine = (over: Partial<Machine> = {}): Machine => ({
  name: "M", host: "h", device: "dgx-spark", reachable: true, error: null, checked_at: at, shutdown_requested: false, operation: null, ...over,
});
const deployment = (over: Partial<Deployment> = {}): Deployment => ({
  name: "Pro", endpoint: "http://x/", machines: ["spark-1", "spark-2"], head: "spark-1", observed_state: "stopped",
  script_state: "stopped", ready: false, discrepancy: false, errors: [], checked_at: at, operation: null, ...over,
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
  it("switch is on when reachable", () => {
    expect(machineOn(machine())).toBe(true);
    expect(machineOn(machine({ reachable: false }))).toBe(false);
  });
});

describe("deployment display", () => {
  it("maps every state", () => {
    expect(deploymentDisplay(deployment({ observed_state: "running", ready: true }))).toMatchObject({ led: "green", label: "running" });
    expect(deploymentDisplay(deployment({ observed_state: "running" }))).toMatchObject({ led: "yellow", pulse: false, label: "running · not ready" });
    expect(deploymentDisplay(deployment({ observed_state: "starting" }))).toMatchObject({ led: "yellow", pulse: true, label: "starting" });
    expect(deploymentDisplay(deployment({ observed_state: "stopping" }))).toMatchObject({ pulse: true, label: "stopping" });
    expect(deploymentDisplay(deployment())).toMatchObject({ led: "dim", label: "stopped" });
    expect(deploymentDisplay(deployment({ observed_state: "failed" }))).toMatchObject({ led: "red", label: "failed" });
    expect(deploymentDisplay(deployment({ observed_state: "unknown" }))).toMatchObject({ led: "orange", label: "unknown" });
  });
  it("switch is on when starting, running or ready", () => {
    expect(deploymentOn(deployment({ observed_state: "starting" }))).toBe(true);
    expect(deploymentOn(deployment({ observed_state: "running" }))).toBe(true);
    expect(deploymentOn(deployment({ observed_state: "unknown", ready: true }))).toBe(true);
    expect(deploymentOn(deployment({ observed_state: "stopping" }))).toBe(false);
    expect(deploymentOn(deployment())).toBe(false);
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
  const ds = (d: Deployment): DeploymentsStatus => ({ deployments: { pro: d }, active: null });
  it("is 15 s when idle and 3 s when busy", () => {
    expect(pollInterval(ms(machine()), ds(deployment()), false)).toBe(15000);
    expect(pollInterval(null, null, false)).toBe(15000);
    expect(pollInterval(ms(machine()), ds(deployment()), true)).toBe(3000);
    expect(pollInterval(ms(machine(), { action: "on", target: "a", machines: ["a"] }), null, false)).toBe(3000);
    expect(pollInterval(null, ds(deployment({ operation: running("stop") })), false)).toBe(3000);
  });
});
