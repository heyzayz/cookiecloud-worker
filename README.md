# CookieCloud · Cloudflare Worker 版

把 CookieCloud 浏览器插件的同步服务免费托管到 Cloudflare，无需自己的服务器，接口与插件完全兼容。

## 一键部署（推荐）
[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/heyzayz/cookiecloud-worker)
全程在网页上点几下即可，无需安装任何软件，只需一个免费的 Cloudflare 账号：

1. 点击上方按钮，打开 Cloudflare 的部署页面；
2. 登录或注册 Cloudflare 账号；
3. 按提示授权，连接你的 GitHub 账号；
4. 在设置页面中保持默认选项，直接点击「部署」；
5. 等待约 1～2 分钟，部署完成后页面会给出你的服务地址，形如 `https://xxxx.workers.dev`；
6. 把这个地址填入浏览器插件即可使用（见下方「开始使用」）。

> 无需自己创建数据库、无需写代码、无需命令行，Cloudflare 会自动准备好全部所需资源。

## 开始使用

1. 在浏览器中安装 CookieCloud 扩展；
2. 打开扩展设置，把「服务器地址」填为上一步得到的 `https://xxxx.workers.dev`；
3. 其余设置（用户标识、加密密钥等）与自建服务器完全一致，点击同步即可。

## 手动部署（可选）

给熟悉命令行的用户，普通用户可跳过：

```bash
npm install

# 创建存储空间，并把输出的 ID 填到 wrangler.toml
npx wrangler kv namespace create COOKIE_KV
npx wrangler kv namespace create COOKIE_KV --preview

npm run deploy
```

## 接口（供开发者参考）

- `GET /health` — 健康检查
- `GET /` — 欢迎页
- `POST /update` — 参数 `{ uuid, encrypted, crypto_type? }`，body 可为 gzip
- `GET|POST /get/:uuid` — 无密码返回存储的 `{ encrypted, crypto_type }`；带 `password`（POST body 或查询参数）返回解密后的数据；`?crypto_type=` 可覆盖算法

## 技术说明

### 与原 Express 版服务端的差异

| 项 | 原 Express 版 | Worker 版 |
|---|---|---|
| 运行时 | Node.js + Express | Cloudflare Workers（无服务器） |
| 存储 | 本地文件 `data/<uuid>.json` | Cloudflare KV `COOKIE_KV` |
| 解密 | crypto-js | Web Crypto API（MD5 用内置 JS 实现） |
| 日志 | winston 写文件 | `console` / Workers 日志 |
| 限流 | express-rate-limit | 轻量内存限流（见下） |

接口、加密算法（`legacy` 与 `aes-128-cbc-fixed`）、API_ROOT 环境变量、CORS、gzip 上传均与原来保持一致，浏览器插件无需任何改动即可指向本 Worker 地址。

### API_ROOT 说明

`wrangler.toml` 的 `[vars]` 中 `API_ROOT` 默认值为 `"/"`（即根路径），一键部署时输入框已预填，直接接受即可，不会被强制要求填写；如需将服务挂到二级目录，可改为 `/cookie` 等（需以斜杠开头）。

### 注意事项

1. **KV 最终一致性**：写入后立即读取可能拿到旧值（一般几十秒内收敛）。如果需要在"上传后立刻下载"的强一致场景下使用，可改用 Cloudflare Durable Objects 存储，或在客户端上传成功后延迟再拉取。
2. **限流**：内置限流为单 isolate 内存实现（每 IP 15 分钟 100 次），仅作基本防护。生产环境建议启用 Cloudflare 的 Rate Limiting 规则。
3. **免费额度**：KV 读写、Worker 请求均有免费额度，超出后需付费。

---

> 本仓库所有内容及代码均基于[原始仓库](https://github.com/easychen/CookieCloud/releases/tag/release-v1.0.3)生成（兼容版本 v1.0.3+），使用 DeepSeek V4 Flash。
