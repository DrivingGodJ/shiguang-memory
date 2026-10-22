import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";

const SESSION_COOKIE = "__Host-shiguang_stats";
const SESSION_SECONDS = 12 * 60 * 60;
const MAX_LOGIN_BYTES = 4096;
const COOKIE_OPTIONS = "Path=/; HttpOnly; Secure; SameSite=Lax";
const encoder = new TextEncoder();

function privateResponse(body, status = 200, contentType = "text/plain; charset=utf-8", extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, no-store",
      "CDN-Cache-Control": "no-store",
      "Vary": "Authorization, Cookie",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      // Preserve same-origin form Origin; no-referrer can turn it into "null".
      "Referrer-Policy": "same-origin",
      ...extraHeaders,
    },
  });
}

function redirect(path, extraHeaders = {}) {
  return privateResponse(null, 303, undefined, { Location: path, ...extraHeaders });
}

function loginPage({ error = "", status = 200, signedIn = false } = {}) {
  return privateResponse(`<!doctype html>
<html lang="zh-CN"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>拾光 · 统计登录</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100svh; display: grid; place-items: center; padding: 32px 20px; background: Canvas; color: CanvasText; }
    main { width: 100%; max-width: 28rem; padding: clamp(24px, 6vw, 40px); border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 20px; }
    .brand { margin: 0 0 12px; font-size: .85rem; letter-spacing: .14em; }
    h1 { margin: 0 0 12px; font-size: 1.75rem; line-height: 1.3; }
    p { line-height: 1.6; } .note { opacity: .72; font-size: .9rem; }
    label { display: block; margin: 24px 0 8px; font-weight: 600; }
    input, button, .primary { width: 100%; min-height: 48px; border-radius: 10px; font: inherit; }
    input { padding: 12px; border: 1px solid color-mix(in srgb, CanvasText 35%, transparent); background: Canvas; color: CanvasText; }
    button, .primary { display: block; margin-top: 28px; padding: 12px 16px; border: 0; background: #a43e32; color: #fff; font-weight: 600; cursor: pointer; text-align: center; text-decoration: none; }
    button:active, .primary:active { opacity: .8; }
    :focus-visible { outline: 3px solid #cc614f; outline-offset: 4px; }
    .error { padding: 12px; border-left: 3px solid #a43e32; background: color-mix(in srgb, CanvasText 6%, Canvas); }
    footer { margin-top: 24px; } footer a { color: inherit; text-underline-offset: 3px; }
  </style>
</head><body><main>
  <p class="brand">拾光 / 管理员</p>
  <h1>${signedIn ? "已登录统计后台" : "查看请求统计"}</h1>
  <p class="note">${signedIn ? "此浏览器的网页登录最长保留 12 小时。" : "使用之前提供的统计专用账号密码，不是服务器登录密码。"}</p>
  ${error ? `<p class="error" role="alert">${error}</p>` : ""}
  ${signedIn ? `<a class="primary" href="/admin/stats">查看请求统计</a>
  <form method="post" action="/admin/logout"><button type="submit">退出网页登录</button></form>` : `<form method="post" action="/admin/login">
    <label for="username">账号</label>
    <input id="username" name="username" value="admin" autocomplete="username" autocapitalize="none" spellcheck="false" required maxlength="64">
    <label for="password">统计专用密码</label>
    <input id="password" name="password" type="password" autocomplete="current-password" autocapitalize="none" spellcheck="false" required maxlength="512">
    <button type="submit">登录并查看统计</button>
  </form>`}
  <footer class="note">${signedIn ? '<a href="/admin/stats.json">查看 JSON 数据</a>' : "登录状态只保存在此浏览器，最长 12 小时。"}</footer>
</main></body></html>`, status, "text/html; charset=utf-8");
}

async function credentialsMatch(username, providedPassword, password) {
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(JSON.stringify([username, providedPassword]))),
    crypto.subtle.digest("SHA-256", encoder.encode(JSON.stringify(["admin", password]))),
  ]);
  return timingSafeEqual(new Uint8Array(providedHash), new Uint8Array(expectedHash));
}

async function basicAuthenticated(request, password) {
  const match = /^Basic +([A-Za-z0-9+/]+={0,2})$/i.exec(request.headers.get("Authorization") || "");
  if (!match || match[1].length > MAX_LOGIN_BYTES) return false;
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(atob(match[1]), "binary"));
    const separator = decoded.indexOf(":");
    if (separator < 0) return false;
    return credentialsMatch(decoded.slice(0, separator), decoded.slice(separator + 1), password);
  } catch {
    return false;
  }
}

async function sessionKey(password) {
  return crypto.subtle.importKey("raw", encoder.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function sessionData(origin, payload) {
  return encoder.encode(`shiguang-stats-session:v1:${origin}:${payload}`);
}

async function createSession(password, origin) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("hex");
  const payload = `${expires}.${nonce}`;
  const signature = await crypto.subtle.sign("HMAC", await sessionKey(password), sessionData(origin, payload));
  return `${SESSION_COOKIE}=${payload}.${Buffer.from(signature).toString("base64url")}; ${COOKIE_OPTIONS}; Max-Age=${SESSION_SECONDS}`;
}

async function sessionAuthenticated(request, password) {
  const cookies = (request.headers.get("Cookie") || "").split(";").map((part) => part.trim());
  const matches = cookies.filter((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (matches.length !== 1) return false;
  const token = matches[0].slice(SESSION_COOKIE.length + 1);
  const match = /^(\d{10})\.([a-f0-9]{32})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const now = Math.floor(Date.now() / 1000);
  const expires = Number(match[1]);
  if (expires <= now || expires > now + SESSION_SECONDS) return false;
  return crypto.subtle.verify("HMAC", await sessionKey(password), Buffer.from(match[3], "base64url"),
    sessionData(new URL(request.url).origin, `${match[1]}.${match[2]}`));
}

async function readLoginForm(request) {
  if (!/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(request.headers.get("Content-Type") || "")) return null;
  if (Number(request.headers.get("Content-Length") || "0") > MAX_LOGIN_BYTES) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let body = "";
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_LOGIN_BYTES) {
        await reader.cancel();
        return null;
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return new URLSearchParams(body);
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

export async function handleAdminRequest(request, env) {
  const url = new URL(request.url);
  if (url.protocol !== "https:") {
    url.protocol = "https:";
    return privateResponse(null, 308, undefined, { Location: url.toString() });
  }
  const password = env.STATS_ADMIN_PASSWORD;
  if (!password) return privateResponse("Statistics access is not configured", 503);

  if (url.pathname === "/admin/login" || url.pathname === "/admin/logout") {
    if (request.method === "GET") return loginPage({ signedIn: await sessionAuthenticated(request, password) });
    if (request.method !== "POST") return privateResponse("Only GET and POST are allowed", 405, undefined, { Allow: "GET, POST" });
    // Native HTML form posts send Origin. Reject missing/null and cross-origin posts.
    if (request.headers.get("Origin") !== url.origin || request.headers.get("Sec-Fetch-Site") === "cross-site") {
      return loginPage({ error: "登录来源无效，请重新打开此页面后再试。", status: 403 });
    }
    if (url.pathname === "/admin/logout") {
      return redirect("/admin/login", { "Set-Cookie": `${SESSION_COOKIE}=; ${COOKIE_OPTIONS}; Max-Age=0` });
    }
    const form = await readLoginForm(request);
    if (!form || form.getAll("username").length !== 1 || form.getAll("password").length !== 1) {
      return loginPage({ error: "登录信息格式不正确，请重新填写。", status: 400 });
    }
    if (!await credentialsMatch(form.get("username"), form.get("password"), password)) {
      return loginPage({ error: "账号或密码不正确。账号为 admin，请使用统计专用密码。", status: 401 });
    }
    return redirect("/admin/stats", { "Set-Cookie": await createSession(password, url.origin) });
  }

  const browserNavigation = (request.headers.get("Accept") || "").includes("text/html");
  const authenticated = await sessionAuthenticated(request, password)
    || (!browserNavigation && await basicAuthenticated(request, password));
  if (!authenticated) {
    // No WWW-Authenticate challenge: mobile browsers must use the HTML form.
    return url.pathname === "/admin/stats" && request.method === "GET"
      ? redirect("/admin/login")
      : privateResponse("Authentication required", 401);
  }
  if (request.method !== "GET") return privateResponse("Only GET is allowed", 405, undefined, { Allow: "GET" });
  if (!env.MAC_PROXY) return privateResponse("Statistics service is unavailable", 503);
  const isJson = url.pathname === "/admin/stats.json";
  const statsPath = isJson ? "/local/uid-stats.json" : "/local/uid-stats";
  try {
    // Never forward browser credentials, query strings, or client-IP headers.
    const upstream = await env.MAC_PROXY.fetch(new Request(`http://shiguang-mac.local${statsPath}`, {
      headers: { Accept: isJson ? "application/json" : "text/html" },
    }));
    if (upstream.status !== 200) {
      console.error(JSON.stringify({ message: "Statistics service returned an unexpected status", status: upstream.status }));
      await upstream.body?.cancel();
      return privateResponse("Statistics service is unavailable", 502);
    }
    return privateResponse(upstream.body, 200, isJson ? "application/json; charset=utf-8" : "text/html; charset=utf-8");
  } catch {
    console.error(JSON.stringify({ message: "Statistics service request failed" }));
    return privateResponse("Statistics service is unavailable", 502);
  }
}
