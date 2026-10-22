import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest } from "../src/index.js";

const ORIGIN = "https://trusted.github.io";
const PASSWORD = "test-only-password:with-colon";
const AUTHORIZATION = `Basic ${btoa(`admin:${PASSWORD}`)}`;
const PRIVATE_BODY = "synthetic-private-statistics";
const ROUTES = [
  ["/admin/stats", "/local/uid-stats", "text/html; charset=utf-8"],
  ["/admin/stats.json", "/local/uid-stats.json", "application/json; charset=utf-8"],
];

function envWith(fetch) {
  return {
    ALLOWED_ORIGINS: ORIGIN,
    STATS_ADMIN_PASSWORD: PASSWORD,
    MAC_PROXY: { fetch },
  };
}

function adminRequest(path, options = {}) {
  return new Request(`https://memory.example${path}`, {
    ...options,
    headers: { Authorization: AUTHORIZATION, ...options.headers },
  });
}

function assertPrivate(response) {
  assert.match(response.headers.get("Cache-Control") || "", /\bno-store\b/i);
  assert.equal(response.headers.has("Access-Control-Allow-Origin"), false);
  const vary = (response.headers.get("Vary") || "").toLowerCase().split(/\s*,\s*/);
  assert.ok(vary.includes("authorization"), "Vary must include Authorization");
}

test("admin statistics require HTTPS before prompting for credentials", async (t) => {
  const upstream = t.mock.fn(async () => new Response(PRIVATE_BODY));
  for (const [route] of ROUTES) {
    const response = await handleRequest(new Request(`http://memory.example${route}`), envWith(upstream));
    assert.equal(response.status, 308);
    assert.equal(response.headers.get("Location"), `https://memory.example${route}`);
    assert.equal(response.headers.has("WWW-Authenticate"), false);
    assertPrivate(response);
  }
  assert.equal(upstream.mock.callCount(), 0);
});

for (const [name, override] of [
  ["missing password", { STATS_ADMIN_PASSWORD: undefined }],
  ["empty password", { STATS_ADMIN_PASSWORD: "" }],
  ["missing binding", { MAC_PROXY: undefined }],
]) {
  test(`admin statistics fail closed with ${name}`, async (t) => {
    const upstream = t.mock.fn(async () => new Response(PRIVATE_BODY));
    const publicFetch = t.mock.method(globalThis, "fetch", async () => {
      throw new Error("Unexpected public fetch");
    });
    for (const [route] of ROUTES) {
      const response = await handleRequest(adminRequest(route), {
        ...envWith(upstream),
        ...override,
      });
      assert.equal(response.status, 503);
      assertPrivate(response);
      assert.equal((await response.text()).includes(PRIVATE_BODY), false);
    }
    assert.equal(upstream.mock.callCount(), 0);
    assert.equal(publicFetch.mock.callCount(), 0);
  });
}

for (const [name, authorization] of [
  ["absent credentials", null],
  ["wrong password", `Basic ${btoa("admin:incorrect")}`],
  ["wrong username", `Basic ${btoa(`guest:${PASSWORD}`)}`],
  ["wrong auth scheme", "Bearer synthetic-test-token"],
  ["invalid base64", "Basic !!!"],
  ["empty basic credentials", "Basic "],
]) {
  test(`admin statistics reject ${name} before contacting the binding`, async (t) => {
    const upstream = t.mock.fn(async () => new Response(PRIVATE_BODY));
    for (const [route] of ROUTES) {
      const response = await handleRequest(
        new Request(`https://memory.example${route}`, {
          headers: authorization === null ? {} : { Authorization: authorization },
        }),
        envWith(upstream),
      );
      assert.equal(response.status, 401);
      assert.match(response.headers.get("WWW-Authenticate") || "", /^Basic\b/i);
      assertPrivate(response);
      assert.equal((await response.text()).includes(PRIVATE_BODY), false);
    }
    assert.equal(upstream.mock.callCount(), 0);
  });
}

for (const [route, localPath, contentType] of ROUTES) {
  test(`authenticated ${route} works without Origin and uses its fixed local path`, async (t) => {
    const upstream = t.mock.fn(async () => new Response(PRIVATE_BODY, {
      headers: {
        "Content-Type": contentType,
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
      },
    }));
    const response = await handleRequest(adminRequest(route), envWith(upstream));
    assert.equal(response.status, 200);
    assertPrivate(response);
    assert.equal(response.headers.get("Content-Type"), contentType);
    assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
    assert.equal(response.headers.get("X-Frame-Options"), "DENY");
    assert.match(response.headers.get("Content-Security-Policy") || "", /frame-ancestors 'none'/);
    assert.equal(await response.text(), PRIVATE_BODY);
    assert.equal(upstream.mock.callCount(), 1);
    const forwarded = upstream.mock.calls[0].arguments[0];
    assert.equal(forwarded.url, `http://shiguang-mac.local${localPath}`);
    assert.equal(forwarded.method, "GET");
  });
}

for (const method of ["POST", "HEAD", "OPTIONS"]) {
  test(`authenticated ${method} cannot read admin statistics`, async (t) => {
    const upstream = t.mock.fn(async () => new Response(PRIVATE_BODY));
    for (const [route] of ROUTES) {
      const response = await handleRequest(adminRequest(route, { method }), envWith(upstream));
      assert.equal(response.status, 405);
      assertPrivate(response);
      assert.equal((await response.text()).includes(PRIVATE_BODY), false);
    }
    assert.equal(upstream.mock.callCount(), 0);
  });
}

test("admin forwarding discards client query strings and sensitive or spoofed headers", async (t) => {
  const upstream = t.mock.fn(async () => new Response(PRIVATE_BODY, {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" },
  }));
  for (const [route, localPath] of ROUTES) {
    const response = await handleRequest(
      adminRequest(`${route}?url=https://evil.example&path=/api/favorites&fresh=1`, {
        headers: {
          Origin: ORIGIN,
          Cookie: "synthetic-session=test-only",
          "CF-Connecting-IP": "203.0.113.4",
          "X-Forwarded-Client-IP": "203.0.113.5",
          "X-Forwarded-For": "203.0.113.6",
          "X-Admin-Authenticated": "true",
          "If-None-Match": "synthetic-etag",
        },
      }),
      envWith(upstream),
    );
    assert.equal(response.status, 200);
    assertPrivate(response);
    const forwarded = upstream.mock.calls.at(-1).arguments[0];
    assert.equal(forwarded.url, `http://shiguang-mac.local${localPath}`);
    for (const header of [
      "Authorization", "Origin", "Cookie", "CF-Connecting-IP", "X-Forwarded-Client-IP",
      "X-Forwarded-For", "X-Admin-Authenticated", "If-None-Match",
    ]) {
      assert.equal(forwarded.headers.has(header), false, `${header} must not reach the local service`);
    }
  }
  assert.equal(upstream.mock.callCount(), ROUTES.length);
});

test("the original local statistics URLs remain unavailable even with valid admin credentials", async (t) => {
  const upstream = t.mock.fn(async () => new Response(PRIVATE_BODY));
  for (const [, localPath] of ROUTES) {
    const response = await handleRequest(
      adminRequest(localPath, { headers: { Origin: ORIGIN } }),
      envWith(upstream),
    );
    assert.equal(response.status, 404);
    assert.equal((await response.text()).includes(PRIVATE_BODY), false);
  }
  assert.equal(upstream.mock.callCount(), 0);
});

test("only exact admin paths can invoke the statistics binding", async (t) => {
  const upstream = t.mock.fn(async () => new Response(PRIVATE_BODY));
  for (const path of [
    "/admin/stats/", "/admin/stats.json/", "/admin/stats/extra", "/admin/stats.json.extra",
    "/admin/%73tats", "/admin/../local/uid-stats",
  ]) {
    const response = await handleRequest(
      adminRequest(path, { headers: { Origin: ORIGIN } }),
      envWith(upstream),
    );
    assert.equal(response.status, 404, path);
    assert.equal((await response.text()).includes(PRIVATE_BODY), false);
  }
  assert.equal(upstream.mock.callCount(), 0);
});

test("admin binding errors return a private 502 without exposing internal details", async (t) => {
  const internalDetail = "synthetic-internal-binding-error";
  const upstream = t.mock.fn(async () => { throw new Error(internalDetail); });
  t.mock.method(console, "error", () => {});
  for (const [route] of ROUTES) {
    const response = await handleRequest(adminRequest(route), envWith(upstream));
    assert.equal(response.status, 502);
    assertPrivate(response);
    assert.equal((await response.text()).includes(internalDetail), false);
  }
});

test("all non-200 admin upstream responses become private 502 responses without their content", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const status of [204, 302, 401, 404, 500, 503]) {
    const upstream = t.mock.fn(async () => new Response(status === 204 ? null : PRIVATE_BODY, {
      status,
      headers: { Location: "http://shiguang-mac.local/internal", "X-Internal-Detail": PRIVATE_BODY },
    }));
    for (const [route] of ROUTES) {
      const response = await handleRequest(adminRequest(route), envWith(upstream));
      assert.equal(response.status, 502, `upstream ${status}`);
      assertPrivate(response);
      assert.equal(response.headers.has("Location"), false);
      assert.equal(response.headers.has("X-Internal-Detail"), false);
      assert.equal((await response.text()).includes(PRIVATE_BODY), false);
    }
  }
});

test("a forged cache cannot bypass admin authentication or supply an authenticated response", async (t) => {
  let cacheReads = 0;
  let cacheWrites = 0;
  let backgroundTasks = 0;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "caches");
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: {
      default: {
        async match() { cacheReads += 1; return new Response("forged-cache-content"); },
        async put() { cacheWrites += 1; },
      },
    },
  });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, "caches", descriptor);
    else delete globalThis.caches;
  });
  const upstream = t.mock.fn(async () => new Response(PRIVATE_BODY));
  const context = { waitUntil() { backgroundTasks += 1; } };
  for (const [route] of ROUTES) {
    const unauthorized = await handleRequest(
      new Request(`https://memory.example${route}`), envWith(upstream), context,
    );
    assert.equal(unauthorized.status, 401);
    assertPrivate(unauthorized);
    const authorized = await handleRequest(adminRequest(route), envWith(upstream), context);
    assert.equal(authorized.status, 200);
    assertPrivate(authorized);
    assert.equal(await authorized.text(), PRIVATE_BODY);
  }
  assert.equal(upstream.mock.callCount(), ROUTES.length);
  assert.equal(cacheReads, 0);
  assert.equal(cacheWrites, 0);
  assert.equal(backgroundTasks, 0);
});
