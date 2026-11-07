**简体中文** | [English](GUIDE.en.md)

# 使用、配置与开发指南

[返回作品展示](../README.md)

## 快速开始

1. 打开网页版，输入 B站 UID 或个人空间链接，点击“查找收藏夹”。
2. 选择一个可公开访问的收藏夹；也可在“链接导入”粘贴 `https://www.bilibili.com/list/ml{收藏夹ID}`。
3. 保持页面打开，等待首次完整同步，然后按日期浏览或搜索。

无需安装扩展或登录 B站，不会修改收藏夹。下次使用同一浏览器会返回本地保存的收藏夹。iPhone 用 Safari 的“分享 → 添加到主屏幕”；Android 使用浏览器的添加/安装功能。旧的无图标快捷方式需删除后重新添加。

## 使用说明

![拾光深色模式](../docs/images/shiguang-dark-mode.jpg)

收藏夹链接、视频元数据和同步时间保存在浏览器 IndexedDB。服务端不建立用户收藏数据库，也不接收、保存或转发 B站 Cookie；只读取公开接口。代理保留最近 100 次可识别请求及各 UID 的累计次数，统计后台需要独立认证，不公开访问记录。

网页经只读同步网关和服务查询 B站公开接口，具备路由校验、缓存、排队和频率限制。主动刷新绕过短期缓存，数量变化会触发完整核对。清除站点数据会清除本地回忆；不同设备和浏览器之间不会自动同步，请保留原收藏夹。

私密收藏夹无法读取。首次同步大型收藏夹可能较慢；服务暂不可用时仍可检索已保存内容。约 2020 年 7 月以前的部分收藏共享 B站迁移时间，无法还原不存在的精确日期。

## 开发与验证

需要 **Node.js 22+** 和 pnpm。

```bash
pnpm --dir worker install
pnpm --dir frontend install
pnpm --dir worker start:local
```

另开终端运行 `pnpm web:dev`，打开 `http://localhost:5173`。

```bash
pnpm --dir worker test
pnpm web:check
pnpm web:build
```

`frontend/` 为网页和本地数据层，`worker/` 为只读网关及本地代理。代理本地统计入口为 `http://127.0.0.1:8787/local/uid-stats`，不记录访客 IP、Cookie 或收藏内容。部署后 `/admin/stats` 使用 `admin` 账号和 Worker secret `STATS_ADMIN_PASSWORD` 认证，统计不进入公共缓存。详细登录、HTTPS 和部署配置见维护文档，不要提交令牌、Tunnel 凭据或 Cookie。

## 文档与支持

- [自托管、同步网关与统计管理](../MEMORY_WEB.md)
- [第三方声明](../THIRD_PARTY_NOTICES.md)
- [问题反馈](https://github.com/DrivingGodJ/shiguang-memory/issues)

## 许可与致谢

[MIT License](../LICENSE)。项目最初从 [TLRKFXE/BiliShelf](https://github.com/TLRKFXE/BiliShelf) 发展而来，保留原作者版权与来源说明。当前仓库仅维护拾光网页、数据层和只读代理；日期检索、时间线、随机回忆、那年今日、UID 导入和 PWA 等由本项目新增，原扩展和收藏管理中心已移除。
