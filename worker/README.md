# Mindfold Cloudflare Worker

该 Worker 为 GitHub Pages 前端提供登录、私有数据同步和附件管理，实际文件存储在 Backblaze B2。

## 1. 创建 Backblaze B2 Bucket

使用你的私有 Bucket `notebook-pwa`，选择与你的 B2 账户匹配的区域。这个 Bucket 保存：

- `mindfold-state.json`：思维导图、多画布数据
- `attachments/`：上传的附件

创建一个只允许该 Bucket 读写的 B2 Application Key，记录 Key ID 和 Application Key。

## 2. 创建 GitHub OAuth App

GitHub Settings > Developer settings > OAuth Apps > New OAuth App：

- Homepage URL：`https://picfik-dot.github.io/notebook-pwa/`
- Authorization callback URL：`https://你的-worker域名/auth/callback`
- Scope：`read:user`，GitHub OAuth 只用于登录身份，不存储 GitHub 文件

## 3. 配置 Worker

修改 `wrangler.toml` 中的 `APP_ORIGIN`、`APP_URL`、`B2_ENDPOINT`、`B2_REGION`、`B2_BUCKET`，创建 KV：

```bash
wrangler kv namespace create SESSIONS
```

把返回的 namespace id 写入 `wrangler.toml`，然后设置密钥：

```bash
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put B2_KEY_ID
wrangler secret put B2_APPLICATION_KEY
```

OAuth 登录会话保存在 Worker KV；B2 凭据也只保存在 Worker Secret，不会发送到浏览器。

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

GitHub Pages 不保存附件本身；附件和导图数据都保存于私有 Backblaze B2 Bucket。
