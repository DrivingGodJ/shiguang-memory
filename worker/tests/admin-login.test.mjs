import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import { handleRequest } from "../src/index.js";

const ORIGIN = "https://memory.example";
const PASSWORD = " test:密碼🚗é &+= ";
const COOKIE_NAME = "__Host-shiguang_stats";
const SESSION_SECONDS = 12 * 60 * 60;
const PRIVATE_BODY = "synthetic-private-statistics";
const encoder = new TextEncoder();

function fixture(t, password = PASSWORD) {
  const upstream = t.mock.fn(async () => new Response(PRIVATE_BODY));
  return {
    upstream,
    env: {
      ALLOWED_ORIGINS: "https://trusted.github.io",
      STATS_ADMIN_PASSWORD: password,
      MAC_PROXY: { fetch: upstream },
    },
  };
}

function basic(password = PASSWORD, username = "admin") {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

function request(path, options = {}) {
  return new Request(new URL(path, ORIGIN), options);
}

function loginRequest({
  path = "/admin/login", username = "admin", password = PASSWORD, origin = ORIGIN,
  body = new URLSearchParams({ username, password }), headers: extraHeaders = {},
  contentType = "application/x-www-form-urlencoded", method = "POST",
} = {}) {
  const headers = new Headers(extraHeaders);
  if (origin !== null) headers.set("Origin", origin);
  if (contentType !== null) headers.set("Content-Type", contentType);
  return request(path, {
    method, headers, body,
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
  });
}

function assertPrivate(response) {
  assert.match(response.headers.get("Cache-Control") || "", /\bno-store\b/i);
  assert.match(response.headers.get("CDN-Cache-Control") || "", /\bno-store\b/i);
  assert.equal(response.headers.has("WWW-Authenticate"), false);
  assert.equal(response.headers.has("Access-Control-Allow-Origin"), false);
  assert.equal(response.headers.get("Referrer-Policy"), "same-origin");
  const vary = (response.headers.get("Vary") || "").toLowerCase().split(/\s*,\s*/);
  assert.ok(vary.includes("authorization"));
  assert.ok(vary.includes("cookie"));
}

async function signIn(env, options) {
  const response = await handleRequest(loginRequest(options), env);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("Location"), "/admin/stats");
  assertPrivate(response);
  const setCookie = response.headers.get("Set-Cookie");
  assert.ok(setCookie?.startsWith(`${COOKIE_NAME}=`));
  return { response, setCookie, cookie: setCookie.split(";")[0] };
}

test("the mobile login page uses a native same-origin POST form without a Basic challenge", async (t) => {
  const { env, upstream } = fixture(t);
  const response = await handleRequest(request("/admin/login", {
    headers: { Accept: "text/html", Authorization: basic() },
  }), env);
  assert.equal(response.status, 200);
  assertPrivate(response);
  const html = await response.text();
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /<form method="post" action="\/admin\/login">/);
  assert.match(html, /name="password" type="password" autocomplete="current-password"/);
  assert.match(html, /autocapitalize="none"/);
  assert.equal(html.includes(PASSWORD), false);
  assert.match(response.headers.get("Content-Security-Policy"), /form-action 'self'/);
  assert.equal(upstream.mock.callCount(), 0);
});

test("form login preserves Unicode, colons and surrounding password spaces and grants both statistics routes", async (t) => {
  const { env, upstream } = fixture(t);
  const { setCookie, cookie } = await signIn(env);
  for (const attribute of ["Path=/", "HttpOnly", "Secure", "SameSite=Lax", `Max-Age=${SESSION_SECONDS}`]) {
    assert.ok(setCookie.split(/;\s*/).includes(attribute), attribute);
  }
  assert.doesNotMatch(setCookie, /(?:^|;)\s*Domain=/i);
  assert.equal(setCookie.includes(PASSWORD), false);
  for (const [route, localPath] of [["/admin/stats", "/local/uid-stats"], ["/admin/stats.json", "/local/uid-stats.json"]]) {
    const response = await handleRequest(request(route, {
      headers: { Cookie: cookie, Accept: "text/html" },
    }), env);
    assert.equal(response.status, 200);
    assertPrivate(response);
    assert.equal(await response.text(), PRIVATE_BODY);
    assert.equal(upstream.mock.calls.at(-1).arguments[0].url, `http://shiguang-mac.local${localPath}`);
  }
  assert.equal(upstream.mock.callCount(), 2);
});

test("a valid session takes priority over stale incorrect browser Basic credentials", async (t) => {
  const { env } = fixture(t);
  const { cookie } = await signIn(env);
  const response = await handleRequest(request("/admin/stats", {
    headers: { Cookie: cookie, Authorization: basic("old-incorrect-password"), Accept: "text/html" },
  }), env);
  assert.equal(response.status, 200);
  assertPrivate(response);
});

test("browser HTML requests use the form even when they send valid Basic credentials", async (t) => {
  const { env, upstream } = fixture(t);
  for (const [path, status] of [["/admin/stats", 303], ["/admin/stats.json", 401]]) {
    const response = await handleRequest(request(path, {
      headers: { Accept: "text/html,application/xhtml+xml", Authorization: basic() },
    }), env);
    assert.equal(response.status, status);
    assertPrivate(response);
    if (status === 303) assert.equal(response.headers.get("Location"), "/admin/login");
  }
  assert.equal(upstream.mock.callCount(), 0);
});

test("API Basic authentication remains compatible with UTF-8, colons and case-insensitive scheme parsing", async (t) => {
  const { env } = fixture(t);
  for (const authorization of [basic(), basic().replace("Basic ", "basic  ")]) {
    const response = await handleRequest(request("/admin/stats.json", {
      headers: { Accept: "application/json", Authorization: authorization },
    }), env);
    assert.equal(response.status, 200);
    assertPrivate(response);
  }
});

for (const [name, origin] of [
  ["cross-origin", "https://evil.example"], ["literal null", "null"], ["missing", null],
  ["different scheme", "http://memory.example"], ["different port", "https://memory.example:8443"],
]) {
  test(`login and logout reject ${name} Origin without setting a cookie`, async (t) => {
    const { env, upstream } = fixture(t);
    for (const path of ["/admin/login", "/admin/logout"]) {
      const response = await handleRequest(loginRequest({ path, origin }), env);
      assert.equal(response.status, 403);
      assertPrivate(response);
      assert.equal(response.headers.has("Set-Cookie"), false);
    }
    assert.equal(upstream.mock.callCount(), 0);
  });
}

test("cross-site Fetch Metadata is rejected even with a forged same-origin Origin", async (t) => {
  const { env } = fixture(t);
  const response = await handleRequest(loginRequest({ headers: { "Sec-Fetch-Site": "cross-site" } }), env);
  assert.equal(response.status, 403);
  assertPrivate(response);
  assert.equal(response.headers.has("Set-Cookie"), false);
});

test("invalid login credentials return a private HTML error without reflecting the submitted password", async (t) => {
  const { env, upstream } = fixture(t);
  const submitted = "wrong-password-<script>alert(1)</script>";
  for (const options of [{ password: submitted }, { username: "guest" }, { password: PASSWORD.trim() }]) {
    const response = await handleRequest(loginRequest(options), env);
    assert.equal(response.status, 401);
    assertPrivate(response);
    assert.equal(response.headers.has("Set-Cookie"), false);
    const html = await response.text();
    assert.equal(html.includes(submitted), false);
    assert.equal(html.includes(PASSWORD), false);
  }
  assert.equal(upstream.mock.callCount(), 0);
});

test("login rejects duplicate fields and unsupported request formats", async (t) => {
  const { env } = fixture(t);
  for (const options of [
    { body: new URLSearchParams({ username: "admin" }) },
    { body: new URLSearchParams([["username", "admin"], ["username", "guest"], ["password", PASSWORD]]) },
    { body: new URLSearchParams([["username", "admin"], ["password", PASSWORD], ["password", "other"]]) },
    { contentType: "application/json", body: JSON.stringify({ username: "admin", password: PASSWORD }) },
    { contentType: null, body: "username=admin&password=invalid" },
  ]) {
    const response = await handleRequest(loginRequest(options), env);
    assert.equal(response.status, 400);
    assertPrivate(response);
    assert.equal(response.headers.has("Set-Cookie"), false);
  }
});

test("the actual 4096-byte login body limit is enforced at its boundary", async (t) => {
  const { env } = fixture(t);
  const prefix = new URLSearchParams({ username: "admin", password: PASSWORD }).toString() + "&padding=";
  for (const [length, expectedStatus] of [[4096, 303], [4097, 400]]) {
    const body = prefix + "x".repeat(length - encoder.encode(prefix).byteLength);
    assert.equal(encoder.encode(body).byteLength, length);
    const response = await handleRequest(loginRequest({ body }), env);
    assert.equal(response.status, expectedStatus);
    assertPrivate(response);
    assert.equal(response.headers.has("Set-Cookie"), expectedStatus === 303);
  }
});

test("an oversized streamed login with no Content-Length is cancelled before authentication", async (t) => {
  const { env, upstream } = fixture(t);
  let cancelled = false;
  let chunk = 0;
  const chunks = [encoder.encode("username=admin&password="), new Uint8Array(4096).fill(120)];
  const body = new ReadableStream({
    pull(controller) {
      if (chunk < chunks.length) controller.enqueue(chunks[chunk++]);
      else controller.close();
    },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  const incoming = loginRequest({ body });
  assert.equal(incoming.headers.has("Content-Length"), false);
  const response = await handleRequest(incoming, env);
  assert.equal(response.status, 400);
  assertPrivate(response);
  assert.equal(response.headers.has("Set-Cookie"), false);
  assert.equal(cancelled, true);
  assert.equal(upstream.mock.callCount(), 0);
});

test("an oversized declared Content-Length and invalid UTF-8 bodies fail closed", async (t) => {
  const { env } = fixture(t);
  for (const options of [
    { headers: { "Content-Length": "5000" } },
    { body: new Uint8Array([0xff, 0xfe]) },
  ]) {
    const response = await handleRequest(loginRequest(options), env);
    assert.equal(response.status, 400);
    assertPrivate(response);
    assert.equal(response.headers.has("Set-Cookie"), false);
  }
});

test("successful login ignores redirect targets and fixes its destination to the statistics page", async (t) => {
  const { env } = fixture(t);
  const body = new URLSearchParams({ username: "admin", password: PASSWORD, next: "https://evil.example/" });
  const { response } = await signIn(env, { path: "/admin/login?next=//evil.example/", body });
  assert.equal(response.headers.get("Location"), "/admin/stats");
});

test("cookie signatures reject payload changes, signature changes, malformed and duplicate cookies", async (t) => {
  const { env, upstream } = fixture(t);
  const { cookie } = await signIn(env);
  const token = cookie.slice(COOKIE_NAME.length + 1);
  const [expires, nonce, signature] = token.split(".");
  const changedSignature = (signature[0] === "A" ? "B" : "A") + signature.slice(1);
  for (const candidate of [
    `${COOKIE_NAME}=${expires}.${nonce.slice(0, -1)}${nonce.endsWith("a") ? "b" : "a"}.${signature}`,
    `${COOKIE_NAME}=${expires}.${nonce}.${changedSignature}`,
    `${COOKIE_NAME}=malformed`, `${COOKIE_NAME}=${token}.extra`,
    `${cookie}; ${cookie}`,
  ]) {
    const response = await handleRequest(request("/admin/stats.json", { headers: { Cookie: candidate } }), env);
    assert.equal(response.status, 401);
    assertPrivate(response);
  }
  assert.equal(upstream.mock.callCount(), 0);
});

test("a correctly signed session expires server-side after twelve hours", async (t) => {
  const { env, upstream } = fixture(t);
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  const { cookie } = await signIn(env);
  now += SESSION_SECONDS * 1000;
  const response = await handleRequest(request("/admin/stats.json", { headers: { Cookie: cookie } }), env);
  assert.equal(response.status, 401);
  assertPrivate(response);
  assert.equal(upstream.mock.callCount(), 0);
});

test("sessions cannot be replayed on another host or port or after password rotation", async (t) => {
  const { env, upstream } = fixture(t);
  const { cookie } = await signIn(env);
  for (const url of ["https://other.example/admin/stats.json", "https://memory.example:8443/admin/stats.json"]) {
    const response = await handleRequest(new Request(url, { headers: { Cookie: cookie } }), env);
    assert.equal(response.status, 401);
    assertPrivate(response);
  }
  const rotated = await handleRequest(request("/admin/stats.json", { headers: { Cookie: cookie } }), {
    ...env, STATS_ADMIN_PASSWORD: "new-synthetic-password",
  });
  assert.equal(rotated.status, 401);
  assertPrivate(rotated);
  assert.equal(upstream.mock.callCount(), 0);
});

test("logout clears the browser cookie through a same-origin POST and GET does not log out", async (t) => {
  const { env } = fixture(t);
  const { cookie } = await signIn(env);
  const confirmation = await handleRequest(request("/admin/logout", { headers: { Cookie: cookie } }), env);
  assert.equal(confirmation.status, 200);
  assertPrivate(confirmation);
  assert.equal(confirmation.headers.has("Set-Cookie"), false);
  const loggedOut = await handleRequest(loginRequest({ path: "/admin/logout", headers: { Cookie: cookie } }), env);
  assert.equal(loggedOut.status, 303);
  assertPrivate(loggedOut);
  assert.equal(loggedOut.headers.get("Location"), "/admin/login");
  const clearCookie = loggedOut.headers.get("Set-Cookie") || "";
  assert.ok(clearCookie.startsWith(`${COOKIE_NAME}=;`));
  assert.match(clearCookie, /Max-Age=0(?:;|$)/);
  const anonymous = await handleRequest(request("/admin/stats.json"), env);
  assert.equal(anonymous.status, 401);
  assertPrivate(anonymous);
});

test("cookie-authenticated forwarding does not pass credentials, client headers or queries to the VPC", async (t) => {
  const { env, upstream } = fixture(t);
  const { cookie } = await signIn(env);
  const response = await handleRequest(request("/admin/stats.json?next=https://evil.example&path=/local/private", {
    headers: {
      Cookie: cookie, Authorization: basic("stale-password"), Origin: ORIGIN,
      "CF-Connecting-IP": "203.0.113.4", "X-Forwarded-Client-IP": "203.0.113.5",
    },
  }), env);
  assert.equal(response.status, 200);
  assertPrivate(response);
  const forwarded = upstream.mock.calls[0].arguments[0];
  assert.equal(forwarded.url, "http://shiguang-mac.local/local/uid-stats.json");
  assert.deepEqual([...forwarded.headers], [["accept", "application/json"]]);
});

test("login and existing cookie sessions fail closed when the password is unavailable", async (t) => {
  const { env, upstream } = fixture(t);
  const { cookie } = await signIn(env);
  for (const incoming of [request("/admin/login"), loginRequest(), request("/admin/stats.json", { headers: { Cookie: cookie } })]) {
    const response = await handleRequest(incoming, { ...env, STATS_ADMIN_PASSWORD: undefined });
    assert.equal(response.status, 503);
    assertPrivate(response);
    assert.equal(response.headers.has("Set-Cookie"), false);
  }
  assert.equal(upstream.mock.callCount(), 0);
});
