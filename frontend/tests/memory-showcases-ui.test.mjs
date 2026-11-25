import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const frontendRoot = new URL("../", import.meta.url);

test("memory home renders a full random page with one whole-page refresh action", async () => {
  const source = await readFile(new URL("src/memory/MemoryApp.vue", frontendRoot), "utf8");

  assert.match(source, /const RANDOM_MEMORY_PAGE_SIZE = 4/);
  assert.match(source, /v-for="video in randomMemories"/);
  assert.match(source, /@click="refreshRandomMemories\(\)"/);
  assert.match(source, />\s*换一组\s*</);
  assert.doesNotMatch(source, /randomFromCurrent|RandomMemoryDialog/);
});

test("on-this-day memories render every matching year and every item in that year", async () => {
  const source = await readFile(new URL("src/memory/MemoryApp.vue", frontendRoot), "utf8");

  assert.match(source, /v-for="group in todayMemoryGroups"/);
  assert.match(source, /v-for="video in group\.items"/);
  assert.match(source, /\{\{ group\.year \}\}/);
  assert.match(source, /已按年份全部展开/);
});

test("visible memory covers open Bilibili directly instead of a detail dialog", async () => {
  const card = await readFile(
    new URL("src/memory/components/MemoryVideoCard.vue", frontendRoot),
    "utf8",
  );

  assert.match(card, /<a\s+[\s\S]*:href="video\.videoUrl"/);
  assert.doesNotMatch(card, /emit\('remember'/);
});

test("the redesigned journey exposes all three memory paths and accessible filter state", async () => {
  const source = await readFile(new URL("src/memory/MemoryApp.vue", frontendRoot), "utf8");
  const css = await readFile(new URL("src/memory/memory.css", frontendRoot), "utf8");

  assert.match(source, /class="memory-paths" aria-label="选择回忆方式"/);
  assert.match(source, /href="#random-memories"/);
  assert.match(source, /href="#today-memories"/);
  assert.match(source, /href="#memory-finder"/);
  assert.equal((source.match(/class="memory-paths__icon" aria-hidden="true"/g) || []).length, 3);
  assert.match(source, /class="collection-header__ledger" aria-label="收藏夹概况"/);
  assert.match(source, /<dt>最近收藏<\/dt>/);
  assert.doesNotMatch(source, /<dt>上次整理<\/dt>/);
  assert.match(source, /class="filter-control__label">搜索收藏/);
  assert.match(source, /class="filter-control__label">按收藏日期/);
  assert.match(source, /:aria-pressed="viewMode === 'timeline'"/);
  assert.match(source, /class="connection-banner" role="status"/);
  assert.match(
    source,
    /<section id="memory-finder"[\s\S]*<section class="results-section"[\s\S]*<\/section>\s*<\/section>\s*<p class="legacy-note"/,
  );
  assert.match(css, /\.filter-panel \{[\s\S]*position: sticky/);
  assert.match(
    css,
    /@media \(max-width: 820px\)[\s\S]*\.filter-panel \{\s*position: sticky;\s*top: calc\(env\(safe-area-inset-top, 0px\) \+ 8px\)/,
  );
  assert.match(css, /\.memory-paths \{[\s\S]*margin-top: 20px/);
  assert.match(css, /--surface-sticky:/);
  assert.match(css, /--z-sticky: 20/);
  assert.match(css, /\.filter-panel \{[\s\S]*z-index: var\(--z-sticky\)/);
  assert.match(
    css,
    /@media \(max-width: 560px\)[\s\S]*\.memory-showcase \.memory-card \{\s*flex-direction: column/,
  );
});
