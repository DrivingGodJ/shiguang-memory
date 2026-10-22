<p align="right"><a href="./README.md">中文</a></p>

# Shiguang · Bilibili Favorites Time Machine

<p align="center">
  Turn your favorites into a searchable timeline you can revisit by date or rediscover at random.
</p>

<p align="center">
  <a href="https://drivinggodj.github.io/shiguang-memory/"><strong>Open Shiguang</strong></a>
</p>

## What it is

Shiguang reads publicly accessible Bilibili favorite folders and builds a local index from the original favorite timestamps. It lets you return to a year, month, or day, search old favorites, browse a timeline, and open a random memory.

It requires no extension or Bilibili login and never modifies a favorite folder.

## Screenshots

### Light mode

![Shiguang's redesigned light interface showing DrivingGodJ's default favorites and Random Memory](./docs/images/shiguang-light-mode.jpg)

### Dark mode

![Shiguang's redesigned dark interface showing DrivingGodJ's default favorites and Random Memory](./docs/images/shiguang-dark-mode.jpg)

## Getting started

1. Open the [Shiguang web app](https://drivinggodj.github.io/shiguang-memory/).
2. Enter a Bilibili UID or profile URL and select a public favorite folder.
3. Alternatively, expand link import and paste a public favorite-folder URL.
4. Keep the page open for the first full sync, then browse by date or search.

The selected folder and synced metadata are stored in the current browser. Opening the site again in the same browser restores that collection automatically.

### Add it to your Home Screen

- iPhone: open the site in Safari, tap Share, then choose **Add to Home Screen**.
- Android: use **Add to Home screen** or **Install app** in a supported browser.

The installed web app uses the Shiguang icon and opens in its own window. Remove and re-add an older shortcut if it was created before the icon was available.

## Features

- Filter favorites by year, month, or exact date
- Discover public favorite folders from a UID
- Search titles, uploaders, descriptions, and BV IDs
- Timeline and grid views
- Random Memory and On This Day
- Reconcile videos removed from the remote folder during refresh
- Preserve metadata for unavailable or previously synced videos
- Installable Home Screen experience with a dedicated app icon
- Responsive layouts for phones and desktop browsers
- Automatically follows the system light or dark appearance

## Data and privacy

- Folder information, video metadata, and sync timestamps stay in browser IndexedDB.
- The service does not maintain a central database of visitors' favorites.
- It does not accept, store, or forward Bilibili cookies.
- It reads only folders available without signing in.
- It exposes no favorite create, move, or delete operations.
- Clearing site data also removes the local index from that browser.

## How it works

```text
GitHub Pages web app
  -> https://api.drivinggodj.dpdns.org
  -> read-only Cloudflare gateway and Tunnel
  -> read-only service on the server
  -> Bilibili public favorites API
  -> IndexedDB in the visitor's browser
```

The gateway accepts only fixed read-only routes and validated identifiers. It applies caching, request queues, and rate limits. Each browser keeps its own local collection data.

## Older favorite dates

Bilibili returns original favorite timestamps for most items. Some favorites from around July 2020 or earlier may share a migration timestamp in the current API data. Shiguang displays the returned value and does not invent a more precise date.

## Limitations

- Private favorite folders cannot be read without authentication.
- Large folders require a paginated first sync.
- New synchronization pauses while the local service is unavailable, but already indexed items remain searchable.
- Browser data does not synchronize automatically between devices.

## Local development

Node.js 22+ and pnpm are recommended.

```bash
pnpm --dir worker install
pnpm --dir frontend install
pnpm --dir worker start:local
pnpm web:dev
```

Open `http://localhost:5173`. For checks and builds:

```bash
pnpm --dir worker test
pnpm web:check
pnpm web:build
```

See [MEMORY_WEB.md](./MEMORY_WEB.md) for the complete self-hosting notes. Never commit account tokens, Tunnel credentials, cookies, or other secrets.

## Open-source lineage and new work

Shiguang originated as an open-source fork of [TLRKFXE/BiliShelf](https://github.com/TLRKFXE/BiliShelf), initially carrying forward its Vue/Vite project structure and its adaptation of Bilibili's favorite-folder APIs. This standalone repository now contains only the Shiguang web app, local data layer, and read-only proxy; the original extension and collection manager source have been removed.

The Shiguang web app's date search, timeline, random memories, On This Day view, UID import, PWA support, local IndexedDB schema, and read-only data proxy were added in this project. The repository continues to follow the MIT License and retains the original copyright and lineage notices.

[MIT License](./LICENSE)
