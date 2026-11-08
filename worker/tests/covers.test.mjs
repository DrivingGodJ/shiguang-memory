import assert from "node:assert/strict";
import test from "node:test";
import { buildCoverUpstreamUrl, handleRequest } from "../src/index.js";

const ORIGIN = "https://trusted.github.io";
const path = "/bfs/archive/24510253fc7cd23d81c396af4a981d0eb368d745.jpg";
const url = `https://proxy.example/api/cover?path=${encodeURIComponent(path)}`;
const env = { ALLOWED_ORIGINS: ORIGIN };
const request = (options = {}) => new Request(url, { ...options, headers: { Origin: ORIGIN, ...options.headers } });

test("cover gateway accepts only hashed archive images on its fixed CDN, never arbitrary URLs or redirects", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("must not fetch"); });
  assert.equal(buildCoverUpstreamUrl(url), `https://i0.hdslb.com${path}@640w_360h_1c.webp`);
  for (const bad of ["https://127.0.0.1/private", "//evil.example/test.jpg", "/bfs/archive/../private.jpg", "/bfs/archive/test.svg", `${path}?redirect=evil`, `${path}@99999w`, "/bfs/face/24510253fc7cd23d81c396af4a981d0eb368d745.jpg"]) {
    const res = await handleRequest(new Request(`https://proxy.example/api/cover?path=${encodeURIComponent(bad)}`, { headers: { Origin: ORIGIN } }), env);
    assert.equal(res.status, 400, bad);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("cover gateway respects existing origins and GET-only protections", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("must not fetch"); });
  assert.equal((await handleRequest(request({ headers: { Origin: "https://evil.example" } }), env)).status, 403);
  assert.equal((await handleRequest(request({ method: "POST" }), env)).status, 405);
  assert.equal((await handleRequest(request({ method: "OPTIONS" }), env)).status, 204);
  assert.equal(fetch.mock.callCount(), 0);
});

test("cover responses stream only image bytes, cache thumbnails, and do not forward client secrets to CDN or VPC", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response("synthetic-image", {
    headers: { "Content-Type": "image/webp", "Set-Cookie": "must-not-forward", "X-Private": "must-not-forward" },
  }));
  const vpc = t.mock.fn(() => { throw new Error("must not use VPC"); });
  const res = await handleRequest(request({ headers: { Cookie: "private", Authorization: "private", "CF-Connecting-IP": "203.0.113.1" } }), { ...env, MAC_PROXY: { fetch: vpc } });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "synthetic-image");
  assert.equal(res.headers.get("Content-Type"), "image/webp");
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assert.match(res.headers.get("Cache-Control"), /max-age=86400/);
  assert.equal(res.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(res.headers.has("Set-Cookie"), false);
  assert.equal(res.headers.has("X-Private"), false);
  const [, options] = fetch.mock.calls[0].arguments;
  assert.deepEqual(Object.keys(options.headers).sort(), ["Accept", "Referer"]);
  assert.equal(options.redirect, "manual");
  assert.equal(vpc.mock.callCount(), 0);
});

test("failed, redirected, non-image and oversized upstream responses are not served or cached", async (t) => {
  for (const [status, headers] of [
    [302, { Location: "http://127.0.0.1/private" }], [403, {}],
    [200, { "Content-Type": "text/html" }], [200, { "Content-Type": "image/svg+xml" }],
    [200, { "Content-Type": "image/jpeg", "Content-Length": String(3 * 1024 * 1024) }],
  ]) {
    const mock = t.mock.method(globalThis, "fetch", async () => new Response("not-an-image", { status, headers }));
    const res = await handleRequest(request(), env);
    assert.equal(res.status, 502);
    assert.equal(res.headers.get("Cache-Control"), "no-store");
    assert.equal(res.headers.has("Location"), false);
    mock.mock.restore();
  }
  t.mock.method(globalThis, "fetch", async () => { throw new Error("internal-detail"); });
  const res = await handleRequest(request(), env);
  assert.equal(res.status, 502);
  assert.equal((await res.text()).includes("internal-detail"), false);
});
