[简体中文](GUIDE.zh-CN.md) | **English**

# Usage, Configuration and Development

[Back to the project](../README.en.md)

## Quick start

1. Open the website, enter a Bilibili UID or profile URL, and find its favorites folders.
2. Select an accessible public folder, or paste `https://www.bilibili.com/list/ml{folderID}` under link import.
3. Keep the page open for the first full sync, then browse by date or search.

No extension or Bilibili login is required, and folders are never modified. The same browser returns to its locally saved folder. On iPhone, use Safari → Share → Add to Home Screen; on Android, use the browser's add/install action. Remove and recreate old shortcuts that lack the icon.

## Usage

![Shiguang dark mode](../docs/images/shiguang-dark-mode.jpg)

Folder links, video metadata and sync times live in browser IndexedDB. The server does not build a user favorites database or accept, store or forward Bilibili cookies. It reads public APIs only. The proxy retains the latest 100 identifiable requests and cumulative counts by UID; statistics require separate administrator authentication and are not public.

The web app queries Bilibili through a read-only gateway and service with route validation, caching, queues and rate limits. Manual refresh bypasses short-term caches; count changes trigger full reconciliation. Clearing site data removes local memories. Devices and browsers do not sync automatically, so retain the original favorites folder.

On phones, video cards use two columns. Covers load through the existing gateway's `/api/cover` thumbnail cache, with a fallback to the original image. Only hashed archive covers on the fixed Bilibili image CDN are accepted; cookies and other credentials are never forwarded. Existing saved collections do not need to be imported again.

Private folders cannot be read. Large first syncs can take time. Saved content remains searchable during service outages. Some favorites from before roughly July 2020 share Bilibili's migration timestamp; missing exact dates cannot be reconstructed.

## Development and checks

Requires **Node.js 22+** and pnpm.

```bash
pnpm --dir worker install
pnpm --dir frontend install
pnpm --dir worker start:local
```

In another terminal, run `pnpm web:dev` and open `http://localhost:5173`.

```bash
pnpm --dir worker test
pnpm web:check
pnpm web:build
```

`frontend/` contains the website and local data layer; `worker/` contains the read-only gateway and local proxy. Local proxy statistics are at `http://127.0.0.1:8787/local/uid-stats` and exclude visitor IPs, cookies and favorites content. Deployed `/admin/stats` uses the `admin` account and Worker secret `STATS_ADMIN_PASSWORD`; statistics are excluded from public caches. See the maintenance guide for authentication, HTTPS and deployment. Never commit tokens, Tunnel credentials or cookies.

## Documentation and support

- [Self-hosting, gateway and statistics administration (Chinese)](../MEMORY_WEB.md)
- [Third-party notices](../THIRD_PARTY_NOTICES.md)
- [Report an issue](https://github.com/DrivingGodJ/shiguang-memory/issues)

## License and credits

[MIT License](../LICENSE). Shiguang originated from [TLRKFXE/BiliShelf](https://github.com/TLRKFXE/BiliShelf) and preserves the original copyright and attribution. This repository now maintains only the Shiguang web app, data layer and read-only proxy. Date search, timeline, random memories, On This Day, UID import and PWA support were added here; the original extension and favorites management center were removed.
