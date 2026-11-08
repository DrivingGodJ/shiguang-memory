import { normalizeProxyBaseUrl } from "./favorite-link.js";

export function coverSources(value, proxyBaseUrl = "") {
  if (!value) return [];
  let image;
  try {
    const raw = String(value).trim();
    image = new URL(raw.startsWith("//") ? `https:${raw}` : raw.replace(/^http:\/\//i, "https://"));
    if (image.protocol !== "https:" || image.username || image.password) return [];
  } catch {
    return [];
  }
  const base = normalizeProxyBaseUrl(proxyBaseUrl);
  const isArchive = /^i[012]\.hdslb\.com$/i.test(image.hostname)
    && !image.port
    && /^\/bfs\/archive\/[a-f0-9]{32,64}\.(?:jpe?g|png|webp|avif)$/i.test(image.pathname);
  return isArchive && base
    ? [`${base}/api/cover?path=${encodeURIComponent(image.pathname)}`, image.href]
    : [image.href];
}
