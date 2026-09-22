# Mindfold

一个使用 Python 静态服务器驱动的原生 PWA 思维导图工具，灵感来自轻量、专注的 MindNow 工作流。

## 运行

```bash
python3 server.py
```

然后打开 http://127.0.0.1:8000 。无需安装 Node 或第三方依赖。

## 功能

- 拖拽节点和画布，自由组织结构
- `Tab` 添加子节点，`Enter` 添加同级节点，`Backspace` 删除节点
- 节点文字、配色、缩放、导出 SVG
- 本地 localStorage 自动保存
- Service Worker 离线缓存，可安装为 PWA
- 多画布管理：新建、切换、删除
- 中心节点一键回到画布中心
- 12 种节点颜色和鼠标滚轮缩放
- 本地 Python 服务开启后，多终端每 3 秒自动同步数据
- 可选 Cloudflare Worker + 私有 GitHub 数据仓库：同步导图并上传附件

## 多终端同步

在同一台电脑或局域网环境中运行 `python3 server.py`，多个终端访问同一个服务地址即可同步。跨互联网同步需要把 Python 服务部署到一台可访问的服务器；GitHub Pages 本身是静态托管，不能直接保存和同步用户数据，因此未登录本地服务时会自动使用浏览器本地保存。

## 云端附件与编辑

项目包含 `worker/` 目录，用于部署 Cloudflare Worker。配置后，页面可以登录 GitHub，将导图数据和附件保存到私有 GitHub 数据仓库。图片和 PDF 可在线预览，Markdown、纯文本、JSON 和代码文件可在线编辑保存，Office 等其他文件支持上传和下载。部署步骤见 `worker/README.md`。

## B2 CORS 自动配置

如果改用浏览器直连 B2，可在本机执行：

```bash
python3 configure_b2_cors.py
```

脚本会在终端安全读取 B2 Key ID 和 Application Key，自动为 `mindfold-data` 写入 `b2-cors.json` 中的规则。密钥不会写入项目，也不要提交到 GitHub。浏览器直连 B2 的写入模式会暴露凭据，生产环境仍建议使用 Worker 代理。

## GitHub Pages

仓库包含 `.github/workflows/deploy-pages.yml`。创建 `picfik-dot/notebook-pwa` 后推送 `main` 分支，GitHub Actions 会自动发布；在仓库 Settings > Pages 中将 Source 设为 GitHub Actions。
