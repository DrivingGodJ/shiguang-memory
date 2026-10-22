# 拾光 · B站收藏时光机

这是拾光的 GitHub Pages 网页入口。它可以根据 UID 查询账号下无需登录即可访问的收藏夹，也支持直接粘贴收藏夹链接；随后把收藏时间、标题、UP 主、简介和封面保存到当前浏览器的 IndexedDB，并提供年月日筛选、关键词搜索、时间轴、随机回忆和“那年今日”。

## 工作方式

```text
GitHub Pages 前端
  -> 只读 Cloudflare Worker 固定入口
  -> Workers VPC 私网服务
  -> Cloudflare Tunnel
  -> 服务器只读代理（127.0.0.1:8787）
  -> B站公开收藏接口

浏览器 IndexedDB
  <- 收藏元数据、上次收藏夹、同步时间
```

首页会直接排出 4 段随机回忆，“换一组”会整组更换；“那年今日”则按年份展开往年同月同日的全部收藏。

网页不会接收或保存 B站 Cookie，也不会移动、删除或新增 B站收藏。私密收藏夹不能仅凭链接读取，第一版只支持公开收藏夹。

Cloudflare 只负责公网入口和私网转发，访问 B站接口的出口是代理服务器的网络 IP。生产服务已迁移到 Linux 服务器，不再依赖 Mac 在线；它不使用 Browser Rendering 时长。

## 本地运行

前端需要 Node.js 20.11+；当前 Worker 工具链建议使用 Node.js 22+。同时需要 pnpm。

```bash
pnpm --dir worker install
pnpm --dir frontend install
```

终端一启动 Mac 本地代理：

```bash
pnpm --dir worker start:local
```

终端二：

```bash
pnpm web:dev
```

打开 `http://localhost:5173`。本地网页会默认使用 `http://localhost:8787` 代理。

## 当前线上部署

线上唯一入口是 `https://api.drivinggodj.dpdns.org`，普通访客只可使用三个 GET 路由：

- `/api/health`（也兼容 `/health`）
- `/api/folders?uid=...`
- `/api/favorites?mediaId=...&page=...&pageSize=40`（主动刷新可附带 `fresh=1` 绕过两层缓存）

它不能转发任意 URL，也不接受写请求。收藏页在代理服务器上缓存 5 分钟；未命中缓存的请求会排队、限速，并按访客 IP 限制频率，降低公共服务被滥用后触发 B站风控的风险。

重新部署 Worker 网关：

```bash
pnpm --dir worker exec wrangler deploy
```

`worker/wrangler.jsonc` 已绑定现有的 Workers VPC 服务。若在新的 Cloudflare 账号重新部署，需要先创建 Tunnel、把 VPC 服务指向 Tunnel 的 `127.0.0.1:8787`，再把新服务 ID 写入配置。

## 统计管理入口

- `/admin/stats`：最近 100 次可识别请求和全部 UID 的累计次数。
- `/admin/stats.json`：同一份统计的 JSON 数据。

这两个统计路由仅接受 GET，并要求 HTTPS。浏览器未登录时会跳转到 `/admin/login` 的原生 HTML 表单，不再依赖手机兼容性不一致的 HTTP 认证弹窗。用户名固定为 `admin`，专用随机密码保存在 Worker secret `STATS_ADMIN_PASSWORD` 中，不与服务器登录密码共用。首次设置或更换密码：

```bash
pnpm --dir worker exec wrangler secret put STATS_ADMIN_PASSWORD
```

按提示输入高熵随机密码，不要将密码写入源码、配置文件、URL 或 GitHub。缺少 secret 时入口返回 503。网页登录只接受同源 POST 和最多 4 KiB 的表单，错误密码返回明确提示，不回显密码。成功后设置 `__Host-` 前缀、`HttpOnly; Secure; SameSite=Lax` 的签名 Cookie，有效期最多 12 小时；签名绑定当前站点和用途，服务器校验过期时间，更换密码会使已有会话失效。`/admin/login` 提供查看统计和退出网页登录的操作。退出会清除此浏览器的 Cookie；若怀疑会话泄露，应更换密码以使所有已签发会话失效。

脚本可继续预先发送 Basic Authorization 读取统计；HTML 浏览器导航只使用 Cookie，避免旧的弹窗凭据干扰网页登录。未认证的 JSON 请求返回 401，所有入口都不再发送原生认证 challenge。管理入口独立于公共 API 的 CORS 流程，读取无需 Origin，但登录及退出的 POST 必须携带同源 Origin。所有管理响应均为 `private, no-store`，不会进入公共缓存，不向其他站点开放跨域读取；凭据和 Cookie 不写入应用日志。

认证成功后，Worker 只通过现有 VPC binding 转发固定的本地统计路径，不转发浏览器密码、Cookie 或客户端 IP 头，也不会把任意路径变成代理。原 `/local/uid-stats` 和 `/local/uid-stats.json` 仍不能通过公网 Worker 直接访问。

当前 Linux 服务位于 `/opt/shiguang-memory/worker`，统计文件为 `/var/lib/shiguang-memory/uid-request-stats.json`。`shiguang-memory-proxy.service`、`shiguang-memory-tunnel.service` 和 `shiguang-memory-watchdog.timer` 已启用；原 Mac 启动项已停用，旧数据和配置保留用于回退。

Workers VPC 要求 Tunnel 使用 `--protocol quic`，并放行出站 UDP 7844。HTTP/2 即使显示 Tunnel 已连接，也不满足 VPC 的传输要求；不要以它作为此部署的回退模式。[Cloudflare 官方说明](https://developers.cloudflare.com/workers-vpc/reference/troubleshooting/)

## 可选的 Mac 自托管

若选择在 Mac 自托管，安装器会配置三个登录级 LaunchAgent：

- `com.drivinggodj.shiguang-memory-proxy`：启动本地只读代理。
- `com.drivinggodj.shiguang-memory-tunnel`：通过 QUIC 建立到 Workers VPC 的出站 Tunnel。
- `com.drivinggodj.shiguang-memory-watchdog`：每两分钟检查公网健康状态，连续失败两次才重启 Tunnel，并设置十分钟重启冷却。

登录 Mac 后代理与 Tunnel 会自动启动并在退出时自动重启，健康检查按两分钟间隔运行。

如果启动项丢失、需要更新本机运行副本或重新安装，可以在项目根目录执行：

```bash
node worker/scripts/install-macos-service.mjs
```

安装器会同步代理与健康检查脚本到 `~/Library/Application Support/ShiguangMemory/runtime/worker/`，生成并加载三个启动项，同时在 `~/Library/Application Support/ShiguangMemory/launchagents/` 保存启动配置副本。已有 UID 请求统计会保留。Node.js 和 cloudflared 使用 Homebrew 的稳定路径，更新软件后无需修改版本目录。

Tunnel 使用仅限当前隧道的连接令牌文件 `~/Library/Application Support/ShiguangMemory/secrets/tunnel-token`，直接由 cloudflared 读取，日常启动不依赖 Wrangler 的 OAuth 登录。该目录权限为 `700`、令牌文件权限为 `600`；不要将它提交到仓库。首次在其他 Mac 安装时，需要先把对应 Tunnel 的连接令牌保存到这个私有文件，再运行安装器。

查看状态或手动重启：

```bash
launchctl print gui/$(id -u)/com.drivinggodj.shiguang-memory-proxy
launchctl print gui/$(id -u)/com.drivinggodj.shiguang-memory-tunnel
launchctl print gui/$(id -u)/com.drivinggodj.shiguang-memory-watchdog
launchctl kickstart -k gui/$(id -u)/com.drivinggodj.shiguang-memory-proxy
launchctl kickstart -k gui/$(id -u)/com.drivinggodj.shiguang-memory-tunnel
launchctl kickstart -k gui/$(id -u)/com.drivinggodj.shiguang-memory-watchdog
```

日志位于 `~/Library/Logs/ShiguangMemory/`。本地代理仅监听 `127.0.0.1`，家庭路由器无需开放端口。
守护脚本源码位于 `worker/scripts/tunnel-watchdog.sh`，本机运行副本安装在 `~/Library/Application Support/ShiguangMemory/`，避免 macOS 登录项无法读取“文稿”目录。
健康检查会先检查本地代理；代理无响应时先恢复代理，再检查公网 Tunnel。Tunnel 连续两次失败才重启，只有成功发出重启命令后才开始计算冷却时间。

本地代理会把成功的收藏夹读取请求按 UID 做持久统计，不保存访客 IP、Cookie 或收藏内容。Mac 自托管时可打开 `http://127.0.0.1:8787/local/uid-stats` 查看统计，原始数据保存在 `~/Library/Application Support/ShiguangMemory/data/uid-request-stats.json`。公网访问仍需通过上面的独立管理入口认证。

只有选择 Mac 自托管时才需要让 Mac 保持已登录、联网且未睡眠；当前 Linux 生产服务不受 Mac 关机影响。访客已存入自己浏览器的数据仍可离线检索。

## 部署 GitHub Pages

1. 将仓库推送到 GitHub。
2. 在仓库 `Settings -> Pages` 中把 Source 设为 `GitHub Actions`。
3. 在 `Settings -> Secrets and variables -> Actions -> Variables` 新建：

```text
BILI_MEMORY_PROXY_URL=https://api.drivinggodj.dpdns.org
```

4. 运行 `Deploy Memory Web to GitHub Pages` 工作流，或推送到 `main`。

部署完成后，访客只需输入 UID 并选择收藏夹，也可以直接粘贴公开收藏夹链接。收藏夹 ID 和已经同步的视频保存在访问者自己的浏览器里；再次打开网页会自动恢复，并在数据超过 30 分钟未刷新时检查最新收藏。

网页同时发布 `apple-touch-icon.png` 和 `manifest.webmanifest`。iPhone 添加到主屏幕时优先使用 180×180 的 Apple Touch Icon，其他支持安装网页应用的浏览器可使用 Manifest 中的 192×192 和 512×512 PNG 图标。

## 同步策略

- 第一次连接执行完整分页同步，每页 40 条，请求之间主动降速。
- 再次打开或点击“刷新最新”时，从最新一页开始读取并绕过短期缓存；若远端收藏总数与本地不一致，会自动继续完整核对并隐藏已经取消收藏的视频，否则在连续命中已有记录后快速停止。
- “完整同步”会重新遍历全部页面，并把 B站中已经移除的条目标记为本地留档，而不是删除旧元数据。
- B站约 2020 年 7 月以前的部分收藏可能共享一个迁移时间。网页会按接口原值显示，不推测不存在的精确日期。

## 开源来源与新增内容

拾光最初从 [TLRKFXE/BiliShelf](https://github.com/TLRKFXE/BiliShelf) 的开源分支发展而来，早期沿用了其 Vue/Vite 工程组织和 B站收藏夹接口适配方式。当前独立仓库只保留拾光网页、数据层与只读代理实现，原扩展和收藏管理中心源码已经移除。

收藏日期检索、时间线、随机回忆、那年今日、UID 导入、PWA、本地 IndexedDB 数据结构以及只读数据代理由拾光新增实现。项目继续遵守仓库内的 MIT License，并保留原作者版权声明与来源说明。
