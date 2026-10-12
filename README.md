# Clarte · GitHub Pages 内测版

这是 Clarte 的静态网站版本，可直接部署到 GitHub Pages。

## 数据保存方式

纸张、墨水和折叠状态等用户数据仍保存在每个使用者自己的浏览器 localStorage 中。
GitHub 只托管网页代码和 Excel 模板，不保存用户录入的手账数据。

因此：
- 同一个 GitHub Pages 地址持续升级时，用户原来的本地数据会继续保留。
- 换浏览器、换设备、清理浏览器网站数据时，本地数据不会自动同步。
- 建议定期使用「我的 → 导出全部数据」保存 JSON 备份。
- 将来从 GitHub Pages 换到自定义域名时，需要在旧网址导出 JSON，再到新域名导入一次。

## GitHub Pages 部署

当前仓库：`clarteot/clarte`

在 GitHub 仓库中：

1. 打开 `Settings`
2. 进入 `Pages`
3. 在 `Build and deployment` 中选择 `Deploy from a branch`
4. Branch 选择 `main`
5. Folder 选择 `/(root)`
6. 保存

默认访问地址通常会是：

`https://clarteot.github.io/clarte/`

## 内测说明

当前加入了 `noindex` 与 `robots.txt`，用于提示搜索引擎不要收录内测页面。
这不是密码保护；知道网址的人仍然可以访问。
如需邀请码访问控制，可在下一阶段增加。
