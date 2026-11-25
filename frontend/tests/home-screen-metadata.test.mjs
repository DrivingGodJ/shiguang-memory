import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const frontendRoot = new URL("../", import.meta.url);

async function readPngSize(relativePath) {
  const png = await readFile(new URL(relativePath, frontendRoot));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

test("publishes iPhone and installable web app metadata", async () => {
  const html = await readFile(new URL("index.html", frontendRoot), "utf8");
  const manifest = JSON.parse(
    await readFile(new URL("public/manifest.webmanifest", frontendRoot), "utf8"),
  );

  assert.match(html, /rel="apple-touch-icon"[^>]+apple-touch-icon-v3\.png/);
  assert.match(html, /rel="manifest"[^>]+manifest\.webmanifest/);
  assert.match(html, /name="apple-mobile-web-app-title" content="拾光"/);
  assert.equal(manifest.short_name, "拾光");
  assert.equal(manifest.display, "standalone");
  assert.deepEqual(
    manifest.icons.map((icon) => icon.sizes),
    ["192x192", "512x512"],
  );
  assert.deepEqual(await readPngSize("public/apple-touch-icon-v3.png"), {
    width: 180,
    height: 180,
  });
  assert.deepEqual(await readPngSize("public/app-icon-192-v3.png"), {
    width: 192,
    height: 192,
  });
  assert.deepEqual(await readPngSize("public/app-icon-512-v3.png"), {
    width: 512,
    height: 512,
  });
});

test("memory web follows the system light and dark color scheme", async () => {
  const html = await readFile(new URL("index.html", frontendRoot), "utf8");
  const css = await readFile(new URL("src/memory/memory.css", frontendRoot), "utf8");

  assert.match(
    html,
    /name="theme-color" content="#efe9dc" media="\(prefers-color-scheme: light\)"/,
  );
  assert.match(
    html,
    /name="theme-color" content="#171a17" media="\(prefers-color-scheme: dark\)"/,
  );
  assert.match(css, /color-scheme: light dark/);
  assert.match(css, /@media \(prefers-color-scheme: dark\)/);
  assert.match(css, /--surface-sticky: rgba\(29, 33, 28, 0\.94\)/);
  assert.match(css, /\.filter-panel \{[\s\S]*background: var\(--surface-sticky\)/);
  assert.match(css, /\.memory-card \{[\s\S]*background: var\(--surface-raised\)/);
});

test("uses Source Han Serif for reading and ships its Noto Serif SC counterpart for devices without it", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("package.json", frontendRoot), "utf8"),
  );
  const main = await readFile(new URL("src/main.ts", frontendRoot), "utf8");
  const css = await readFile(new URL("src/memory/memory.css", frontendRoot), "utf8");
  const license = await readFile(
    new URL("public/font-licenses/Noto-Serif-SC-OFL.txt", frontendRoot),
    "utf8",
  );

  assert.equal(packageJson.dependencies["@fontsource-variable/noto-serif-sc"], "5.3.0");
  assert.match(main, /@fontsource-variable\/noto-serif-sc\/wght\.css/);
  assert.match(css, /--font-memory: "Source Han Serif SC", "Source Han Serif CN", "Noto Serif SC Variable"/);
  assert.match(css, /:root \{[^}]*font-family: var\(--font-memory\)/);
  assert.match(css, /\.memory-card h3 \{[\s\S]*font-family: var\(--font-memory\)/);
  assert.match(license, /SIL OPEN FONT LICENSE Version 1\.1/);
});
