# FlashBlank7 · Lilies

个人主页：[flashblank7.github.io](https://flashblank7.github.io/)

研究与项目、小说与世界、原创音乐与翻唱。保留 Lilies 开场动画，界面可用顶部的「中文 / EN」切换；作品正文和原始作品名称保留原文。

- 中文界面：<https://flashblank7.github.io/?lang=zh>
- English interface: <https://flashblank7.github.io/?lang=en>

## 发布

`dist/` 是完整、可独立托管的静态网站。推送到 `main` 后，GitHub Actions 检查站内链接和音频文件，再将该目录发布到 GitHub Pages。无需 Jekyll、后端服务或 ChatGPT 登录。

本地检查：`python scripts/validate-site.py`

本地预览：`python -m http.server 8080 --directory dist`

网站保留原有 34 个页面、22 个阅读页、27 份音频，并加入随记入口。新增工作稿不属于本次发布，小说只使用已确认的原有正文。

## 内容管理后台

`admin/` 实现了个人在线管理后台；完整部署步骤、权限范围、故障恢复和验收说明见 [admin/README.md](admin/README.md)。后台与公开网站分别构建、分别部署。公开网站依旧使用 GitHub Pages，后台使用所有者自己的 Cloudflare Workers。

公开内容源为 `content/published.json`，页面模板为 `site-templates/`。草稿及未公开图片保存到独立的私有仓库 `FlashBlank7/flashblank7-site-content`，不要复制到本仓库。

开发检查：`pnpm install --frozen-lockfile`、`pnpm check`、`python scripts/validate-site.py`。需要 Node 24、pnpm 11.25.0。当前默认云配置保留占位符，完成 GitHub App、Cloudflare 认证和线上验收前，不能视为可用的线上后台。

仓库早期的 Chirpy 模板文件保留在根目录和 Git 历史中，不参与当前 `dist/` 发布。根目录原有的 `LICENSE` 来自该模板，不为小说、插图或音乐等作品授予许可。
