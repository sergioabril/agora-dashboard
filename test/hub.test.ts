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

  it("streams a start and classifies a 409 JSON answer", async () => {
    const body = '{"type":"operation"}\n';
    const fetch = vi.fn(async () => new Response(body, { status: 202, headers: { "content-type": "application/x-ndjson" } }));
    vi.stubGlobal("fetch", fetch);
    const r = await hub.deploymentStream("pro", "start", new AbortController().signal);
    if (!r.ok) throw new Error("expected a stream");
    expect([r.status, await new Response(r.body).text()]).toEqual([202, body]);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://hub.test:3334/admin/deployments/pro");
    expect(init).toMatchObject({ method: "POST", body: '{"action":"start"}', headers: { Accept: "application/x-ndjson" } });

    stub(409, { detail: { code: "busy", message: "another operation is active", blocking: { action: "start", target: "flash" } } });
    expect(await hub.deploymentStream("pro", "start", new AbortController().signal)).toEqual({
      ok: false, error: { kind: "conflict", status: 409, code: "busy", message: "another operation is active", blocking: { action: "start", target: "flash" } },
    });
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

  it("posts a new machine as JSON and maps a 422 detail string", async () => {
    const detail = "invalid configuration at : Value error, password or key_path is required";
    const fetch = stub(422, { detail });
    expect(await hub.addMachine({ name: "Spark 5", port: 22 })).toEqual({ ok: false, error: { kind: "invalid", status: 422, message: detail } });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://hub.test:3334/admin/machines/add");
    expect(init).toMatchObject({ method: "POST", body: '{"name":"Spark 5","port":22}' });
  });

  it("posts deployment add and update to their paths", async () => {
    const fetch = stub(200, { id: "pro" });
    await hub.addDeployment({ name: "Mini", machines: ["spark-2"] });
    await hub.updateDeployment("pro", { name: null, machines: [] });
    const calls = fetch.mock.calls as unknown as [string, RequestInit][];
    expect(calls.map(([url, init]) => [url, init.method, init.body])).toEqual([
      ["http://hub.test:3334/admin/deployments/add", "POST", '{"name":"Mini","machines":["spark-2"]}'],
      ["http://hub.test:3334/admin/deployments/pro/update", "POST", '{"name":null,"machines":[]}'],
    ]);
  });

  it("posts machine updates to their path", async () => {
    const fetch = stub(200, { id: "spark-1" });
    await hub.updateMachine("spark-1", { name: "S", port: null });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect([url, init.method, init.body]).toEqual(["http://hub.test:3334/admin/machines/spark-1/update", "POST", '{"name":"S","port":null}']);
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
    [{ AGORA_HUB_URL: "http://hub", AGORA_HUB_ADMIN_TOKEN: "short" }, "agora-dashboard: AGORA_HUB_ADMIN_TOKEN must be REPLACE_WITH_HUB_TOKEN, empty, or the hub's 64-hex admin token"],
  ])("rejects bad config %#", async (env, pattern) => {
    vi.resetModules();
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const failure = import("../app/hub.server");
    await expect(failure).rejects.toThrow(pattern);
    await expect(failure).rejects.not.toThrow(/short/);
  });

  it.each(["REPLACE_WITH_HUB_TOKEN", ""])("sends no Authorization header with token %j", async (token) => {
    vi.resetModules();
    vi.stubEnv("AGORA_HUB_URL", "http://hub.test");
    vi.stubEnv("AGORA_HUB_ADMIN_TOKEN", token);
    const noAuth = await import("../app/hub.server");
    const fetch = stub(200, { machines: {}, active: null });
    expect(await noAuth.machinesStatus()).toMatchObject({ ok: true });
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).not.toHaveProperty("Authorization");
  });
});

describe("home assistant client", () => {
  it("calls the hub's integration endpoints", async () => {
    const fetch = stub(200, {});
    await hub.homeAssistant();
    await hub.saveHomeAssistant({ host: "10.0.0.9" });
    await hub.testHomeAssistant({});
    await hub.homeAssistantSwitches();
    const calls = (fetch.mock.calls as unknown as [string, RequestInit][]).map(([url, init]) => [url, init.method, init.body]);
    const base = "http://hub.test:3334/admin/integrations/homeassistant";
    expect(calls).toEqual([
      [base, "GET", undefined], [base, "POST", '{"host":"10.0.0.9"}'], [`${base}/test`, "POST", "{}"], [`${base}/switches`, "GET", undefined],
    ]);
  });
});
