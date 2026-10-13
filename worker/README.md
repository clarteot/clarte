# Clarte 服务端邀请码 API

用于 Clarte GitHub Pages 内测站的邀请码验证。纸张、墨水等用户数据仍保存在每位用户自己的浏览器 localStorage；D1 只保存邀请码状态。

## 能力

- 一码一次（默认 `max_uses = 1`）
- 邀请码明文只在创建时返回一次，数据库只保存 SHA-256 哈希
- 邀请码可以设置标签、有效期、最大使用次数
- 兑换成功后发放 HMAC 签名访问令牌
- 每次打开网站可通过 `/verify` 服务端验证令牌
- 管理端可以查看邀请码是否已使用、最后使用时间，并可立即作废
- 作废邀请码后，由该邀请码签发的访问令牌也会在下一次 `/verify` 时失效

## API

### `POST /redeem`

```json
{ "code": "CLARTE-XXXX-XXXX" }
```

成功返回访问 `token`。

### `POST /verify`

Header：`Authorization: Bearer <token>`

验证令牌是否仍有效。

### `GET /admin/invites`

Header：`Authorization: Bearer <ADMIN_TOKEN>`

查看邀请码状态。

### `POST /admin/invites`

Header：`Authorization: Bearer <ADMIN_TOKEN>`

```json
{
  "label": "小A",
  "maxUses": 1,
  "expiresAt": "2026-12-31T23:59:59+08:00"
}
```

创建新邀请码。邀请码明文只在本次响应返回一次。

### `POST /admin/invites/:id/revoke`

Header：`Authorization: Bearer <ADMIN_TOKEN>`

立即作废邀请码。

## Cloudflare 初始化

1. 创建一个 Workers 项目。
2. 创建 D1 数据库 `clarte-invites`。
3. 把 D1 绑定名设置为 `DB`。
4. 执行 `schema.sql` 初始化表。
5. 设置两个 Worker Secret：
   - `AUTH_SECRET`：至少 32 字节随机字符串，用于签署访问令牌。
   - `ADMIN_TOKEN`：只给站长本人使用的管理密钥。
6. 设置普通环境变量：
   - `ALLOWED_ORIGINS=https://clarteot.github.io`
   - `SESSION_DAYS=90`
7. 部署 Worker，得到 `https://<worker-name>.<account>.workers.dev` 地址。
8. 健康检查：打开 `<Worker URL>/health` 应返回 `{"ok":true,...}`。

Cloudflare 官方建议敏感值使用 Worker Secrets，不要写进 `wrangler.toml` 或提交到 Git。

## 注意

GitHub Pages 的静态文件本身仍是公开资源。因此这套方案能做到真正的“邀请码由服务器判定、一码一次、可撤销、可统计”，但不能把公开仓库里的前端源码变成私有。如果未来希望连静态资源本身都必须登录后才能取到，需要把整站迁到带访问控制的托管层（例如 Cloudflare Workers Static Assets）。
