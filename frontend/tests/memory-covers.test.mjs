import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { coverSources } from "../src/memory/cover-sources.js";

const path = "/bfs/archive/24510253fc7cd23d81c396af4a981d0eb368d745.jpg";
const proxy = "https://proxy.example";

test("covers use the configured image gateway first and retain the HTTPS original as a bounded fallback", () => {
  for (const raw of [`http://i0.hdslb.com${path}`, `//i0.hdslb.com${path}`]) {
    assert.deepEqual(coverSources(raw, proxy), [
      `${proxy}/api/cover?path=${encodeURIComponent(path)}`,
      `https://i0.hdslb.com${path}`,
    ]);
  }
  assert.deepEqual(coverSources(`https://i0.hdslb.com${path}`), [`https://i0.hdslb.com${path}`]);
  assert.deepEqual(coverSources("https://images.example/cover.jpg", proxy), ["https://images.example/cover.jpg"]);
  for (const value of ["", "not a URL", "javascript:alert(1)", "data:image/svg+xml,test", "https://user:pass@i0.hdslb.com/test"]) {
    assert.deepEqual(coverSources(value, proxy), []);
  }
});

test("every card receives its proxy and image failures reset reactively rather than permanently hiding the DOM image", async () => {
  const card = await readFile(new URL("../src/memory/components/MemoryVideoCard.vue", import.meta.url), "utf8");
  const app = await readFile(new URL("../src/memory/MemoryApp.vue", import.meta.url), "utf8");
  assert.equal((app.match(/:proxy-base-url="settings.proxyBaseUrl"/g) || []).length, 4);
  assert.match(card, /watch\(sources,.*sourceIndex\.value = 0/);
  assert.match(card, /:key="coverUrl"/);
  assert.match(card, /:crossorigin="usesProxy \? 'anonymous' : undefined"/);
  assert.doesNotMatch(card, /image\.hidden|classList\.add/);
});

test("phone showcase and result grids both use two columns with readable vertical cards", async () => {
  const css = await readFile(new URL("../src/memory/memory.css", import.meta.url), "utf8");
  const phone = css.split("@media (max-width: 560px)")[1].split("@media (prefers-color-scheme: dark)")[0];
  for (const grid of ["memory-showcase__grid", "memory-grid"]) {
    assert.ok(phone.includes(`.${grid} {\n    grid-template-columns: repeat(2, minmax(0, 1fr));`));
  }
  assert.match(phone, /\.memory-card h3[\s\S]*font-size: 14px/);
  assert.match(phone, /\.memory-card__open \{\s*min-height: 44px/);
});
