import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, test, expect } from "vitest";
import worker from "../src/index";

const getParams = () => {
  const params = new URLSearchParams();
  params.append("client_id", "1234");
  params.append("refresh_token", "1234");
  params.append("code", "1234");
  params.append("redirect_uri", "http://localhost");
  params.append("grant_type", "refresh_token");
  return params;
};

describe("index.ts", () => {
  test("should return 404 if not posting to token", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("http://localhost", { method: "POST" }),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(404);
  });

  test("should return Access-Control-Allow-Origin: '*'", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("http://localhost/token", { method: "POST" }),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  test("should return Access Control headers if responding to OPTIONS", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("http://localhost/token", { method: "OPTIONS" }),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    expect(res.headers.has("Access-Control-Allow-Methods")).toBe(true);
  });

  test("should give 415 error if content type is not application/x-www-form-urlencoded", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("http://localhost/token", { method: "POST" }),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(415);
  });

  test("should give 400 error when no grant_type found", async () => {
    const ctx = createExecutionContext();
    const params = getParams();
    params.delete("grant_type");
    const res = await worker.fetch(
      new Request("http://localhost/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain("grant_type");
  });

  test("should give 400 error when no client_id found", async () => {
    const ctx = createExecutionContext();
    const params = getParams();
    params.delete("client_id");
    const res = await worker.fetch(
      new Request("http://localhost/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain("client_id");
  });

  test("should give 400 error when no token url found in kv namespace found", async () => {
    const ctx = createExecutionContext();
    const params = getParams();
    const res = await worker.fetch(
      new Request("http://localhost/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain("token");
  });

  test("should give 400 error when no secret found in environment variables", async () => {
    const ctx = createExecutionContext();
    const params = getParams();
    await env.TOKEN_URLS.put("12345", "http://localhost");
    params.set("client_id", "12345");
    const res = await worker.fetch(
      new Request("http://localhost/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain("secret");
  });

  test("should give 400 error when grant_type is not supported", async () => {
    const ctx = createExecutionContext();
    await env.TOKEN_URLS.put("1234", "http://example.org");
    const params = getParams();
    params.set("grant_type", "bad_grant_type");
    const res = await worker.fetch(
      new Request("http://localhost/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }),
      env,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain("grant_type");
  });
  test("should give 429 when client_credentials is over its rate limit", async () => {
    const ctx = createExecutionContext();
    await env.TOKEN_URLS.put("1234", "http://example.org");
    const keys: string[] = [];
    const limitedEnv = {
      ...env,
      CLIENT_CREDENTIALS_LIMITER: {
        limit: async ({ key }: RateLimitOptions) => {
          keys.push(key);
          return { success: false };
        },
      },
    };
    const params = getParams();
    params.set("grant_type", "client_credentials");
    const res = await worker.fetch(
      new Request("http://localhost/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "CF-Connecting-IP": "203.0.113.7",
        },
        body: params.toString(),
      }),
      limitedEnv,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(res.headers.get("Access-Control-Expose-Headers")).toBe("Retry-After");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(keys).toEqual(["1234:203.0.113.7"]);
  });
});
