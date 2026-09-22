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

## GitHub Pages

仓库包含 `.github/workflows/deploy-pages.yml`。创建 `picfik-dot/notebook-pwa` 后推送 `main` 分支，GitHub Actions 会自动发布；在仓库 Settings > Pages 中将 Source 设为 GitHub Actions。
