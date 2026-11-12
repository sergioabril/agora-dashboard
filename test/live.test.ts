import { describe, expect, it } from "vitest";
import {
  actionResult, needsFollow, parseAction, parseDeployment, parseHomeAssistant, parseMachine, pendingActive, readEvents, toastFor, toggleMachine,
} from "../app/live";
import type { Deployment, Operation, StreamEvent } from "../app/types";

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

  it("on update omits blank secrets and sends a blank optional as null", () => {
    expect(parseMachine({ name: "S", port: "", key_path: " ", password: "", sudo_password: "s" }, true)).toEqual({
      name: "S", port: null, key_path: null, sudo_password: "s" });
  });
});

describe("deployment form", () => {
  it("toggles machines in row order and keeps the head rules", () => {
    const order = ["a", "b", "c"];
    expect(toggleMachine(order, [], "", "b")).toEqual({ checked: ["b"], head: "b" });
    expect(toggleMachine(order, ["b"], "b", "a")).toEqual({ checked: ["a", "b"], head: "b" });
    expect(toggleMachine(order, ["a", "b"], "b", "b")).toEqual({ checked: ["a"], head: "" });
    expect(toggleMachine(order, ["a", "c"], "", "a")).toEqual({ checked: ["c"], head: "" });
    expect(toggleMachine(order, ["a", "c"], "c", "b")).toEqual({ checked: ["a", "b", "c"], head: "c" });
  });

  it("sends every checked machine, trims text, and blanks are omitted on add but null on update", () => {
    const form = new FormData();
    for (const [k, v] of [["intent", "x"], ["name", " Mini "], ["machines", "a"], ["machines", "b"], ["head", "b"], ["start_command", " /s.sh "],
      ["stop_command", ""], ["endpoint", "http://a:1/v1"]]) form.append(k, v);
    const add = { machines: ["a", "b"], name: "Mini", head: "b", start_command: "/s.sh", endpoint: "http://a:1/v1" };
    expect(parseDeployment(form)).toEqual(add);
    expect(parseDeployment(form, true)).toEqual({ ...add, stop_command: null });
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

describe("home assistant form", () => {
  it("trims fields, numbers the port and always sends the token", () => {
    expect(parseHomeAssistant({ intent: "save", host: " ha.lan ", port: "8124", token: " t " })).toEqual({ host: "ha.lan", port: 8124, token: "t" });
    expect(parseHomeAssistant({ host: "", port: "", token: "" })).toEqual({ token: "" });
  });
});

describe("deployment log stream", () => {
  const body = (...chunks: string[]) => new ReadableStream<BufferSource>({
    start(c) {
      chunks.forEach((x) => c.enqueue(new TextEncoder().encode(x)));
      c.close();
    },
  });
  it("joins a line split across chunks and reports whether end arrived", async () => {
    const seen: StreamEvent[] = [];
    const line = { type: "line", source: "stdout", text: "[start] loading", at: "t" };
    expect(await readEvents(body(`{"type":"operation","operation":{}}\n{"type":"li`, `ne","source":"stdout","text":"[start] loading","at":"t"}\n`), (e) => seen.push(e))).toBe(false);
    expect(seen).toEqual([{ type: "operation", operation: {} }, line]);
    expect(await readEvents(body(`{"type":"end","operation":{}}`), () => {})).toBe(true);
  });
  it("follows a new operation or a dropped live stream, never while posting", () => {
    const d = (status: Operation["status"]) => ({ operation: { ...op, action: "start", status } }) as Deployment;
    const log = (startedAt: string, open: boolean) => ({ startedAt, lines: [], open, own: false, op });
    expect(needsFollow(d("in_progress"), undefined, false)).toBe(true);
    expect(needsFollow(d("succeeded"), log("2026-11-09T07:00:00+00:00", false), false)).toBe(true);
    expect(needsFollow(d("succeeded"), log(op.started_at, false), false)).toBe(false);
    expect(needsFollow(d("in_progress"), log(op.started_at, false), false)).toBe(true);
    expect(needsFollow(d("in_progress"), log(op.started_at, true), false)).toBe(false);
    expect(needsFollow(d("in_progress"), undefined, true)).toBe(false);
    expect(needsFollow(d("succeeded"), log("2026-11-09T09:00:00+00:00", true), false)).toBe(false);
    expect(needsFollow({ operation: null } as Deployment, undefined, false)).toBe(false);
  });
});
