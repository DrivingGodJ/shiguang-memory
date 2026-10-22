import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const STATE_VERSION = 1;
const DEFAULT_RECENT_LIMIT = 100;

function emptyState() {
  return {
    version: STATE_VERSION,
    totalRequests: 0,
    recent: [],
    uids: {},
  };
}

export function normalizeUid(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  try {
    const uid = BigInt(text);
    return uid > 0n ? uid.toString() : null;
  } catch {
    return null;
  }
}

export function extractUidFromFavoriteResponse(body) {
  try {
    const payload = JSON.parse(Buffer.isBuffer(body) ? body.toString("utf8") : String(body));
    if (payload?.code !== 0) return null;
    return normalizeUid(payload?.data?.info?.mid ?? payload?.data?.info?.upper?.mid);
  } catch {
    return null;
  }
}

function normalizeLoadedState(value, recentLimit) {
  if (!value || typeof value !== "object") return emptyState();
  const state = emptyState();
  state.totalRequests = Number.isSafeInteger(value.totalRequests) && value.totalRequests >= 0
    ? value.totalRequests
    : 0;

  if (Array.isArray(value.recent)) {
    state.recent = value.recent
      .filter((item) => item && normalizeUid(item.uid))
      .slice(0, recentLimit)
      .map((item) => ({
        timestamp: String(item.timestamp || ""),
        uid: normalizeUid(item.uid),
        route: String(item.route || ""),
        mediaId: item.mediaId ? String(item.mediaId) : null,
        page: item.page ? String(item.page) : null,
        cache: String(item.cache || "MISS"),
      }));
  }

  if (value.uids && typeof value.uids === "object") {
    for (const [rawUid, rawEntry] of Object.entries(value.uids)) {
      const uid = normalizeUid(rawUid);
      const count = Number(rawEntry?.count);
      if (!uid || !Number.isSafeInteger(count) || count < 1) continue;
      state.uids[uid] = {
        count,
        firstSeen: String(rawEntry.firstSeen || ""),
        lastSeen: String(rawEntry.lastSeen || ""),
      };
    }
  }
  return state;
}

async function readState(filePath, recentLimit) {
  try {
    const contents = await readFile(filePath, "utf8");
    return normalizeLoadedState(JSON.parse(contents), recentLimit);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return emptyState();
    console.error(JSON.stringify({
      message: "UID request log could not be loaded",
      error: error instanceof Error ? error.message : String(error),
    }));
    return emptyState();
  }
}

async function writeState(filePath, state) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const partialPath = `${filePath}.${process.pid}.partial`;
  await writeFile(partialPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(partialPath, filePath);
  await chmod(filePath, 0o600);
}

export function createUidRequestLog({
  filePath,
  recentLimit = DEFAULT_RECENT_LIMIT,
  now = () => new Date(),
} = {}) {
  if (!filePath) throw new Error("filePath is required");
  const limit = Number.isSafeInteger(recentLimit) && recentLimit > 0
    ? recentLimit
    : DEFAULT_RECENT_LIMIT;
  let state;
  const loadPromise = readState(filePath, limit).then((loaded) => {
    state = loaded;
  });
  let writeQueue = loadPromise;

  async function record({ uid: rawUid, route, mediaId = null, page = null, cache = "MISS" }) {
    const uid = normalizeUid(rawUid);
    if (!uid) return false;
    writeQueue = writeQueue.catch(() => undefined).then(async () => {
      const timestamp = now().toISOString();
      const previous = state.uids[uid];
      state.uids[uid] = {
        count: (previous?.count || 0) + 1,
        firstSeen: previous?.firstSeen || timestamp,
        lastSeen: timestamp,
      };
      state.totalRequests += 1;
      state.recent.unshift({
        timestamp,
        uid,
        route: String(route || ""),
        mediaId: mediaId ? String(mediaId) : null,
        page: page ? String(page) : null,
        cache: String(cache || "MISS"),
      });
      state.recent = state.recent.slice(0, limit);
      await writeState(filePath, state);
    });
    await writeQueue;
    return true;
  }

  async function snapshot() {
    await writeQueue;
    return structuredClone(state);
  }

  return { record, snapshot };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatLocalTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Shanghai",
  }).format(date);
}

export function renderUidStatsHtml(state) {
  const uidRows = Object.entries(state.uids || {})
    .sort(([, left], [, right]) => right.count - left.count || right.lastSeen.localeCompare(left.lastSeen))
    .map(([uid, entry]) => `
      <tr>
        <td><a href="https://space.bilibili.com/${escapeHtml(uid)}" target="_blank" rel="noopener noreferrer">${escapeHtml(uid)}</a></td>
        <td>${entry.count}</td>
        <td>${escapeHtml(formatLocalTime(entry.firstSeen))}</td>
        <td>${escapeHtml(formatLocalTime(entry.lastSeen))}</td>
      </tr>`)
    .join("");
  const recentRows = (state.recent || []).map((event) => `
      <tr>
        <td>${escapeHtml(formatLocalTime(event.timestamp))}</td>
        <td>${escapeHtml(event.uid)}</td>
        <td>${escapeHtml(event.route)}</td>
        <td>${escapeHtml(event.page || "—")}</td>
        <td>${escapeHtml(event.cache)}</td>
      </tr>`).join("");
  const uniqueUidCount = Object.keys(state.uids || {}).length;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="30">
  <title>拾光 · UID 请求统计</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
    body { max-width: 1120px; margin: 0 auto; padding: 32px 20px 64px; background: Canvas; color: CanvasText; }
    h1 { margin-bottom: 8px; } h2 { margin-top: 40px; }
    .note { opacity: .72; } .cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin: 24px 0; }
    .card { padding: 18px; border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 16px; }
    .value { display: block; margin-top: 8px; font-size: 2rem; font-weight: 700; }
    .table-wrap { overflow-x: auto; border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 14px; }
    table { width: 100%; border-collapse: collapse; } th, td { padding: 12px 14px; text-align: left; border-bottom: 1px solid color-mix(in srgb, CanvasText 12%, transparent); white-space: nowrap; }
    th { font-size: .86rem; opacity: .72; } tr:last-child td { border-bottom: 0; } a { color: #df5a48; }
    @media (max-width: 640px) { .cards { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <h1>UID 请求统计</h1>
  <p class="note">统计仅保存在代理服务器。本页每 30 秒刷新，不记录访客 IP、Cookie 或私密收藏内容。</p>
  <div class="cards">
    <div class="card">累计可识别请求<span class="value">${Number(state.totalRequests || 0)}</span></div>
    <div class="card">不同 UID<span class="value">${uniqueUidCount}</span></div>
  </div>
  <h2>全部 UID</h2>
  <div class="table-wrap"><table>
    <thead><tr><th>UID</th><th>请求次数</th><th>首次请求</th><th>最近请求</th></tr></thead>
    <tbody>${uidRows || '<tr><td colspan="4">暂无记录</td></tr>'}</tbody>
  </table></div>
  <h2>最近 100 次请求</h2>
  <div class="table-wrap"><table>
    <thead><tr><th>时间</th><th>UID</th><th>接口</th><th>页码</th><th>缓存</th></tr></thead>
    <tbody>${recentRows || '<tr><td colspan="5">暂无记录</td></tr>'}</tbody>
  </table></div>
</body>
</html>`;
}
