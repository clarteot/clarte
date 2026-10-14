# Clarte · GitHub Pages 内测版

正式站：https://clarteot.github.io/clarte/
当前功能版本：26.3（全部弹窗居中）

## 发布结构

`index.html` 保留服务端邀请码兑换与凭证验证。验证成功后加载 `payload-v26-3-*.txt`，合并 Base64、解压 gzip，再打开应用。应用源文件为 `src/app.html`。

执行 `python build-production.py` 重新生成发布分片及完整性清单，然后执行 `node verify-release.cjs`。分片与入口必须在同一个提交中发布。GitHub Pages 使用现有 main 分支配置；不要运行旧 V23 的手动恢复工作流进行常规升级。

## 数据保存

用户数据仍保存在原网址各自浏览器的 localStorage 中：纸张 `paper_keeper_v1`、墨水 `ink_keeper_v1`、笔 `pen_keeper_v1`。折叠状态、七天搭配记录、备份时间和访问凭证沿用原有键；我的品牌使用 `clarte_journal_brand_config_v1`。

升级不覆盖已有集合。已存在的空集合也会保留。仅在正式键不存在时复制已知预览键，保留旧键。新用户的收藏与我的品牌为空；公共品牌候选项独立保留。缺少旧迁移标记时，已有剩余数量也不会被总数量覆盖。

GitHub 不保存用户录入的收藏，换设备或清理浏览器网站数据不会自动恢复；使用「我的 → 导出全部数据」进行 JSON 备份。现有 Cloudflare 邀请码 API 和管理页面保持不变。
