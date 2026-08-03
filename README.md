# CookieCloud · Cloudflare Worker 版

`server/api`（Express）的忠实移植，改为在 **Cloudflare Workers** 上运行。原服务端源代码保持不动，本目录为独立可部署版本。

## 差异

| 项 | 原 Express 版 | Worker 版 |
|---|---|---|
| 运行时 | Node.js + Express | Cloudflare Workers（无服务器） |
| 存储 | 本地文件 `data/<uuid>.json` | Cloudflare KV `COOKIE_KV` |
| 解密 | crypto-js | Web Crypto API（MD5 用内置 JS 实现） |
| 日志 | winston 写文件 | `console` / Workers 日志 |
| 限流 | express-rate-limit | 轻量内存限流（见下） |

接口、加密算法（`legacy` 与 `aes-128-cbc-fixed`）、API_ROOT 环境变量、CORS、gzip 上传均与原来保持一致，浏览器插件无需任何改动即可指向本 Worker 地址。

## 部署

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/xuyingb/cookiecloud-worker)

点击上方按钮即可 fork 仓库并一键部署：Cloudflare 会自动创建 KV 命名空间、绑定 `COOKIE_KV` 并发布 Worker，全程无需本地环境。

也可以手动部署：

```bash
cd worker
npm install

# 1. 创建 KV 命名空间（把输出的 id / preview_id 填入 wrangler.toml）
npx wrangler kv namespace create COOKIE_KV
npx wrangler kv namespace create COOKIE_KV --preview

# 2. 本地调试（可选）
npm run dev

# 3. 发布
npm run deploy
```

可选：在 `wrangler.toml` 的 `[vars]` 中设置 `API_ROOT = "/cookie"` 以挂到二级目录。

## 接口

- `GET /health` — 健康检查
- `GET /` — 欢迎页
- `POST /update` — 参数 `{ uuid, encrypted, crypto_type? }`，body 可为 gzip
- `GET|POST /get/:uuid` — 无密码返回存储的 `{ encrypted, crypto_type }`；带 `password`（POST body 或查询参数）返回解密后的数据；`?crypto_type=` 可覆盖算法

## 注意事项

1. **KV 最终一致性**：写入后立即读取可能拿到旧值（一般几十秒内收敛）。如果需要在"上传后立刻下载"的强一致场景下使用，可改用 Cloudflare Durable Objects 存储，或在客户端上传成功后延迟再拉取。
2. **限流**：内置限流为单 isolate 内存实现（每 IP 15 分钟 100 次），仅作基本防护。生产环境建议启用 Cloudflare 的 Rate Limiting 规则。
3. **免费额度**：KV 读写、Worker 请求均有免费额度，超出后需付费。
