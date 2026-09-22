# Mindfold Cloudflare Worker

该 Worker 为 GitHub Pages 前端提供私有数据同步和附件管理。

## 1. 创建 GitHub 数据仓库

创建一个私有仓库，例如 `picfik-dot/mindfold-data`。这个仓库保存：

- `mindfold-state.json`：思维导图、多画布数据
- `attachments/`：上传的附件

## 2. 创建 GitHub OAuth App

GitHub Settings > Developer settings > OAuth Apps > New OAuth App：

- Homepage URL：`https://picfik-dot.github.io/notebook-pwa/`
- Authorization callback URL：`https://你的-worker域名/auth/callback`
- Scope：Worker 使用 `repo`，因此只能授权给你信任的私有数据仓库

## 3. 配置 Worker

修改 `wrangler.toml` 中的 `APP_ORIGIN`、`APP_URL`、`GITHUB_OWNER`、`GITHUB_REPO`，创建 KV：

```bash
wrangler kv namespace create SESSIONS
```

把返回的 namespace id 写入 `wrangler.toml`，然后设置密钥：

```bash
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
```

OAuth 登录令牌会加密保存在 Worker KV 会话中；当前 Worker 以用户 OAuth 会话令牌访问 GitHub，不把令牌发送到浏览器。

部署：

```bash
wrangler deploy
```

## 4. 连接前端

将 Worker 地址写入项目根目录的 `sync-config.js`：

```js
window.MINDFOLD_SYNC_ORIGIN = 'https://你的-worker域名';
```

然后重新部署 GitHub Pages。

## 文件能力

- 图片：在线预览
- PDF：在线预览
- Markdown、纯文本、JSON、代码：在线编辑并保存
- Office 和其他二进制文件：上传、列表、下载

GitHub Pages 不保存附件本身；附件和导图数据都保存于私有 GitHub 数据仓库。
