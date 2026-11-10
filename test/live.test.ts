import { describe, expect, it } from "vitest";
import { actionResult, parseAction, parseMachine, pendingActive, toastFor } from "../app/live";
import type { Operation } from "../app/types";

const op: Operation = { action: "on", status: "in_progress", started_at: "2026-11-09T08:00:00+00:00", finished_at: null, error: null, output: "" };

describe("action allowlist", () => {
  it("accepts only kind/action pairs from the allowlist and slug ids", () => {
    expect(parseAction({ kind: "machine", id: "spark-1", action: "on" })).toEqual({ ok: true, request: { kind: "machine", id: "spark-1", action: "on" } });
    expect(parseAction({ kind: "deployment", id: "pro", action: "stop" })).toMatchObject({ ok: true });
    for (const bad of [
      { kind: "machine", id: "spark-1", action: "start" },
      { kind: "deployment", id: "pro", action: "off" },
      { kind: "hub", id: "x", action: "on" },
      { kind: "machine", id: "../admin", action: "on" },
      { kind: "machine", id: "", action: "on" },
      { kind: "machine", action: "on" },
    ]) {
      expect(parseAction(bad)).toMatchObject({ ok: false, status: 422, code: "invalid_request" });
    }
  });
});

describe("add machine form", () => {
  it("keeps known non-empty fields, trims text but not passwords, and parses the port", () => {
    expect(parseMachine({ intent: "add", id: "x", name: " Spark 5 ", host: "spark-5.local", user: "agora", port: "2222",
      password: " p w ", key_path: "", sudo_password: "", shutdown_command: "  " })).toEqual({
      name: "Spark 5", host: "spark-5.local", user: "agora", port: 2222, password: " p w " });
  });
});

describe("hub error mapping", () => {
  it("passes 202 operations through", () => {
    expect(actionResult({ ok: true, data: op })).toEqual({ ok: true, operation: op });
  });
  it("maps a 409 to a red toast naming the blocking resource", () => {
    const r = actionResult({ ok: false, error: { kind: "conflict", status: 409, code: "deployment_active", message: "deployment must be stopped first", blocking: { deployment: "pro" } } });
    expect(r).toEqual({ ok: false, status: 409, code: "deployment_active", message: "deployment must be stopped first", blocking: { deployment: "pro" } });
    if (r.ok) throw new Error("expected failure");
    const t = toastFor({ kind: "machine", id: "spark-1", action: "off" }, r, 1, 0);
    expect(t).toMatchObject({ tone: "red", status: "409", code: "deployment_active", cmd: "machines spark-1 --off" });
    expect(t.lines).toEqual([{ v: "deployment must be stopped first" }, { k: "blocking →", v: "deployment pro" }]);
  });
  it("describes a busy conflict by its active operation", () => {
    const r = actionResult({ ok: false, error: { kind: "conflict", status: 409, code: "busy", message: "another operation is active", blocking: { action: "start", target: "pro", machines: ["spark-1"] } } });
    if (r.ok) throw new Error("expected failure");
    expect(toastFor({ kind: "deployment", id: "flash", action: "start" }, r, 2, 0).lines[1]).toEqual({ k: "blocking →", v: "start pro" });
  });
  it("maps 404 and offline to orange toasts with the hub detail", () => {
    const nf = actionResult({ ok: false, error: { kind: "not_found", status: 404, message: "Machine not found" } });
    if (nf.ok) throw new Error("expected failure");
    expect(toastFor({ kind: "machine", id: "ghost", action: "on" }, nf, 3, 0)).toMatchObject({ tone: "orange", status: "404", code: "not_found", lines: [{ v: "Machine not found" }] });
    const off = actionResult({ ok: false, error: { kind: "offline", status: null, message: "hub unreachable (ECONNREFUSED)" } });
    expect(off).toMatchObject({ ok: false, status: null, code: "offline", blocking: null });
  });
});

describe("busy gate after a 202", () => {
  it("involves the toggled machine, or every machine of the deployment", () => {
    expect(pendingActive({ kind: "machine", id: "spark-1", action: "on", since: 0 }, null)).toEqual({ action: "on", target: "spark-1", machines: ["spark-1"] });
    const deployments = { deployments: { pro: { machines: ["spark-1", "spark-2"] } }, active: null } as never;
    expect(pendingActive({ kind: "deployment", id: "pro", action: "start", since: 0 }, deployments)?.machines).toEqual(["spark-1", "spark-2"]);
    expect(pendingActive(null, deployments)).toBeNull();
  });
});
