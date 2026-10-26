# FlashBlank7 · Lilies

个人主页：[flashblank7.github.io](https://flashblank7.github.io/)

研究与项目、小说与世界、原创音乐与翻唱。保留 Lilies 开场动画，界面可用顶部的「中文 / EN」切换；作品正文和原始作品名称保留原文。

- 中文界面：<https://flashblank7.github.io/?lang=zh>
- English interface: <https://flashblank7.github.io/?lang=en>

## 发布

`dist/` 是完整、可独立托管的静态网站。推送到 `main` 后，GitHub Actions 检查站内链接和音频文件，再将该目录发布到 GitHub Pages。无需 Jekyll、后端服务或 ChatGPT 登录。

本地检查：`python scripts/validate-site.py`

本地预览：`python -m http.server 8080 --directory dist`

34 个页面、22 个阅读页、27 份音频均包含在仓库内。新增工作稿不属于本次发布，小说只使用已确认的原有正文。

仓库早期的 Chirpy 模板文件保留在根目录和 Git 历史中，不参与当前 `dist/` 发布。根目录原有的 `LICENSE` 来自该模板，不为小说、插图或音乐等作品授予许可。
