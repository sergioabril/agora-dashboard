import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const TOKEN = "ab".repeat(32);
let hub: typeof import("../app/hub.server");

beforeAll(async () => {
  vi.stubEnv("AGORA_HUB_URL", "http://hub.test:3334/");
  vi.stubEnv("AGORA_HUB_ADMIN_TOKEN", TOKEN);
  hub = await import("../app/hub.server");
});

afterEach(() => vi.unstubAllGlobals());

function stub(status: number, body: unknown) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function stubThrow(error: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => { throw error; }));
}

describe("hub client", () => {
  it("returns data and sends the bearer header", async () => {
    const fetch = stub(200, { machines: {}, active: null });
    expect(await hub.machinesStatus()).toEqual({ ok: true, data: { machines: {}, active: null } });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://hub.test:3334/admin/machines/status");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("posts the action body", async () => {
    const op = { action: "start", status: "in_progress", started_at: "x", finished_at: null, error: null, output: "" };
    const fetch = stub(202, op);
    expect(await hub.deploymentAction("pro", "start")).toEqual({ ok: true, data: op });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://hub.test:3334/admin/deployments/pro");
    expect(init).toMatchObject({ method: "POST", body: '{"action":"start"}' });
  });

  it("classifies hub errors", async () => {
    stub(401, { detail: "Unauthorized" });
    expect(await hub.machinesStatus()).toEqual({ ok: false, error: { kind: "unauthorized", status: 401, message: "Unauthorized" } });

    stub(409, { detail: { code: "deployment_active", message: "deployment must be stopped first", blocking: { deployment: "pro" } } });
    expect(await hub.machineAction("spark-1", "off")).toEqual({
      ok: false,
      error: { kind: "conflict", status: 409, code: "deployment_active", message: "deployment must be stopped first", blocking: { deployment: "pro" } },
    });

    stub(404, { detail: "Machine not found" });
    expect(await hub.machineAction("nope", "on")).toMatchObject({ ok: false, error: { kind: "not_found", message: "Machine not found" } });

    stub(422, { detail: [{ type: "literal_error", loc: ["body", "action"], msg: "Input should be 'on' or 'off'", input: "x" }] });
    expect(await hub.machineAction("spark-1", "on")).toMatchObject({
      ok: false, error: { kind: "invalid", status: 422, message: "body.action: Input should be 'on' or 'off'" },
    });
  });

  it("maps network failures to offline and aborts to timeout", async () => {
    stubThrow(new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } }));
    expect(await hub.deploymentsStatus()).toMatchObject({ ok: false, error: { kind: "offline", message: "hub unreachable (ECONNREFUSED)" } });
    stubThrow(new DOMException("timed out", "TimeoutError"));
    expect(await hub.deploymentsStatus()).toMatchObject({ ok: false, error: { kind: "timeout" } });
  });

  it("never returns the token in errors", async () => {
    stub(401, { detail: "Unauthorized" });
    const results = [await hub.machinesStatus()];
    stubThrow(new Error(`boom ${TOKEN}`));
    results.push(await hub.machinesStatus());
    expect(JSON.stringify(results)).not.toContain(TOKEN);
  });
});

describe("startup validation", () => {
  it.each([
    [{ AGORA_HUB_URL: "", AGORA_HUB_ADMIN_TOKEN: TOKEN }, /AGORA_HUB_URL/],
    [{ AGORA_HUB_URL: "ftp://hub", AGORA_HUB_ADMIN_TOKEN: TOKEN }, /AGORA_HUB_URL/],
    [{ AGORA_HUB_URL: "http://hub", AGORA_HUB_ADMIN_TOKEN: "short" }, /AGORA_HUB_ADMIN_TOKEN/],
  ])("rejects bad config %#", async (env, pattern) => {
    vi.resetModules();
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const failure = import("../app/hub.server");
    await expect(failure).rejects.toThrow(pattern);
    await expect(failure).rejects.not.toThrow(/short/);
  });
});
