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

test("should return 404 if not posting to token", async () => {
  const env = getMiniflareBindings();
  const res = await worker.fetch(
    new Request("http://localhost", { method: "POST" }),
    env
  );
  expect(res.status).toBe(404);
});

test("should return Access-Control-Allow-Origin: '*'", async () => {
  const env = getMiniflareBindings();
  const res = await worker.fetch(
    new Request("http://localhost/token", { method: "POST" }),
    env
  );
  expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
});

test("should return Access Control headers if responding to OPTIONS", async () => {
  const env = getMiniflareBindings();
  const res = await worker.fetch(
    new Request("http://localhost/token", { method: "OPTIONS" }),
    env
  );
  expect(res.status).toBe(200);
  expect(res.headers.has("Access-Control-Allow-Methods")).toBe(true);
});

test("should give 415 error if content type is not application/x-www-form-urlencoded", async () => {
  const env = getMiniflareBindings();
  const res = await worker.fetch(
    new Request("http://localhost/token", { method: "POST" }),
    env
  );
  expect(res.status).toBe(415);
});

test("should give 400 error when no grant_type found", async () => {
  const env = getMiniflareBindings();
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
    env
  );
  expect(res.status).toBe(400);
  const body = await res.text();
  expect(body).toContain("grant_type");
});

test("should give 400 error when no client_id found", async () => {
  const env = getMiniflareBindings();
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
    env
  );
  expect(res.status).toBe(400);
  const body = await res.text();
  expect(body).toContain("client_id");
});

test("should give 400 error when no token url found in kv namespace found", async () => {
  const env = getMiniflareBindings();
  const params = getParams();
  const res = await worker.fetch(
    new Request("http://localhost/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    }),
    env
  );
  expect(res.status).toBe(400);
  const body = await res.text();
  expect(body).toContain("token");
});

test("should give 400 error when no secret found in environment variables", async () => {
  const env = getMiniflareBindings();
  const params = getParams();
  env.TOKEN_URLS.put("1234", "http://localhost");

  params.append("client_id", "1234");
  params.append("refresh_token", "1234");
  params.append("grant_type", "refresh_token");
  const res = await worker.fetch(
    new Request("http://localhost/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    }),
    env
  );
  expect(res.status).toBe(400);
  const body = await res.text();
  expect(body).toContain("secret");
});
