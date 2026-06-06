# 部署

[English](./deployment.md) | [中文](./deployment_zh.md)

Docker 是推荐的部署方式。构建设计为可组合式：

- **仅 Admin** — 单独运行 Admin Console 镜像。存储桶页面正常工作，若 S3 Browser 远端不存在则显示降级提示。
- **独立 S3 Browser** — 单独运行 S3 Browser 镜像；它自行提供 API、SPA 和 MF 远端。
- **嵌入式组合部署** — 同时运行两个镜像。Admin 在运行时接收 `S3_BROWSER_MF_URL` 并将 `/s3-browser/*` 代理到 S3 Browser 容器，因此只需发布 Admin 端口。
- **一体化（`garage-admin-all`）** — 单一镜像：Admin Console 内嵌 S3 Browser 远端，同源伺服于 `/s3-browser`（无代理跳转，无额外容器）。最简单的嵌入部署——单容器，仅需 Admin 密钥。嵌入式 FileBrowser 的数据仍通过 Admin BFF 流转，与组合部署一致。`/s3-browser` 路径是供 Admin 加载的 Module Federation 远端，不是独立 S3 Browser 入口。

Dockerfile、Compose 文件和构建上下文忽略列表位于 `docker/` 下。

## Docker Compose（组合部署）

```bash
cp docker/.env.compose.example docker/.env
# 编辑 docker/.env — 启动前替换所有 secret
docker compose -f docker/docker-compose.yml --env-file docker/.env up -d --build
```

使用默认 profile 时，Admin 访问地址为 **http://localhost:3001**，并将 S3 Browser 远端代理至 **/s3-browser/mf-manifest.json**；S3 Browser 容器仅在 Compose 内部网络可见。最少需配置的 secret：

| 变量                          | 说明                                             |
| ----------------------------- | ------------------------------------------------ |
| `GARAGE_ADMIN_JWT_SECRET`     | Admin JWT 签名随机字符串                         |
| `GARAGE_ADMIN_ENCRYPTION_KEY` | Admin AES-256 存储密钥（恰好 32 个字符）         |
| `GARAGE_ADMIN_PASSWORD`       | Admin Console 登录密码                           |
| `S3_BROWSER_MF_URL`           | 浏览器可见的 S3 Browser manifest URL             |
| `S3_BROWSER_MF_PROXY_TARGET`  | Compose 内部的 S3 Browser URL，供 Admin 代理使用 |

`COMPOSE_PROFILES=`（空值）仅运行 Admin；`COMPOSE_PROFILES=s3-browser` 以 `S3_BROWSER_STATIC_ONLY=true` 模式运行 S3 Browser 镜像（仅 MF / 静态资源）。数据通过 Docker 命名卷持久化（SQLite 数据库）。

## Docker run（单镜像）

```bash
docker build -f docker/garage-admin-console.Dockerfile -t garage-admin-console .
docker run -d -p 3001:3001 -v garage-data:/data \
  -e JWT_SECRET=change-me -e ENCRYPTION_KEY=change-me-exactly-32-characters! \
  -e ADMIN_PASSWORD=change-me garage-admin-console

# 一体化镜像：Admin Console + 嵌入式 S3 Browser 远端，同源伺服
# （单容器，无代理）。与 Admin-only 相同的三个 secret。
docker build -f docker/garage-admin-all.Dockerfile -t garage-admin-all .
docker run -d -p 3001:3001 -v garage-data:/data \
  -e JWT_SECRET=change-me -e ENCRYPTION_KEY=change-me-exactly-32-characters! \
  -e ADMIN_PASSWORD=change-me garage-admin-all

# 独立 S3 Browser 同样只需一个镜像：
docker build -f docker/s3-browser.Dockerfile -t s3-browser .
docker run -d -p 3002:3002 -v s3-browser-data:/data \
  -e JWT_SECRET=change-me -e ENCRYPTION_KEY=change-me-exactly-32-characters! \
  -e ADMIN_PASSWORD=change-me s3-browser
```

Admin 镜像采用多阶段构建（`node:24-alpine`）：先编译 `@garage/tokens` + `@garage/ui`，再编译 Admin API 和 Vite 前端，最后通过 `pnpm deploy` 生成仅含生产依赖的独立 API 目录。Express 从 `/app/static/` 伺服 SPA 并提供 SPA fallback 路由；数据库迁移在启动时自动执行。S3 Browser 镜像默认运行 API + 独立 SPA / MF 远端，设置 `S3_BROWSER_STATIC_ONLY=true` 时仅提供静态 / MF 资源。

## 生产环境变量（Admin 镜像）

| 变量                         | 必填 | 默认值        | 说明                                                                               |
| ---------------------------- | ---- | ------------- | ---------------------------------------------------------------------------------- |
| `JWT_SECRET`                 | 是   | —             | JWT 签名密钥                                                                       |
| `ENCRYPTION_KEY`             | 是   | —             | AES-256 密钥（恰好 32 个 ASCII 字符）                                              |
| `ADMIN_PASSWORD`             | 是   | —             | 控制台登录密码                                                                     |
| `PORT`                       | 否   | `3001`        | 服务端口                                                                           |
| `LOG_LEVEL`                  | 否   | `info`        | 日志级别                                                                           |
| `DATA_DIR`                   | 否   | `/data`       | SQLite 数据库目录                                                                  |
| `STATIC_DIR`                 | 否   | `/app/static` | 前端文件目录                                                                       |
| `S3_BROWSER_MF_URL`          | 否   | —             | 浏览器可见的 MF manifest URL                                                       |
| `S3_BROWSER_MF_PROXY_TARGET` | 否   | —             | Admin `/s3-browser/*` 代理的内部上游地址                                           |
| `S3_BROWSER_STATIC_DIR`      | 否   | —             | 同源伺服内嵌 S3 Browser 远端的目录（`garage-admin-all` 镜像内置；优先级高于代理）  |
| `S3_CORS_ALLOWED_ORIGINS`    | 否   | —             | 逗号分隔的自动管理桶 CORS 规则允许的源（默认为请求方应用的 origin）                |
| `S3_MANAGE_CORS`             | 否   | `true`        | 设为 `false` 则完全由运维人员自行管理桶 CORS                                       |
| `MORGAN_FORMAT`              | 否   | off（生产）   | HTTP 访问日志格式（`combined`、`common`、`dev` 等）；`off` / `none` / `false` 禁用 |

## 生产环境变量（S3 Browser 镜像）

S3 Browser 镜像与 Admin 镜像共享相同的核心环境变量（`JWT_SECRET`、`ENCRYPTION_KEY`、`ADMIN_PASSWORD`、`PORT`、`LOG_LEVEL`、`DATA_DIR`、`STATIC_DIR`、`MORGAN_FORMAT`）。以下为 S3 Browser 特有变量：

| 变量                      | 必填 | 默认值  | 说明                                                        |
| ------------------------- | ---- | ------- | ----------------------------------------------------------- |
| `S3_BROWSER_STATIC_ONLY`  | 否   | `false` | `true` 仅提供静态 / MF 资源（不启动 BFF API）；用于组合部署 |
| `STATIC_CORS_ORIGIN`      | 否   | —       | `S3_BROWSER_STATIC_ONLY` 模式下静态资源允许的 CORS origin   |
| `S3_CORS_ALLOWED_ORIGINS` | 否   | —       | 逗号分隔的自动管理桶 CORS 规则允许的源                      |
| `S3_MANAGE_CORS`          | 否   | `true`  | 设为 `false` 则完全由运维人员自行管理桶 CORS                |

> `S3_CORS_*` 变量同时被 Admin 和 S3 Browser 两个 BFF 读取。

## 生产环境变量（一体化镜像）

`garage-admin-all` 镜像内置了与 Admin 镜像相同的环境变量，并预配置了两个额外默认值：

| 变量                    | 内置默认值                     | 说明                                                |
| ----------------------- | ------------------------------ | --------------------------------------------------- |
| `S3_BROWSER_STATIC_DIR` | `/app/s3-browser-static`       | 同源伺服内嵌的 S3 Browser 远端（无需代理）          |
| `S3_BROWSER_MF_URL`     | `/s3-browser/mf-manifest.json` | 浏览器可见的 MF manifest 路径（同源，无需单独 URL） |

仅需三个核心 secret（`JWT_SECRET`、`ENCRYPTION_KEY`、`ADMIN_PASSWORD`）——无需 S3 Browser 容器或代理配置。

### 使用一体化镜像

请通过 Admin Console 使用 `garage-admin-all`：

1. 打开 Admin Console 地址，例如 `http://localhost:3001`。
2. 添加 Garage 集群，集群 endpoint 填 Garage Admin API 地址，例如 `http://garage:3903`。
3. 单独设置集群的 S3 endpoint，例如 `http://garage:3900`。如果留空，Admin API 会从 Admin endpoint 推导 Garage 默认 S3 端口。
4. 打开存储桶详情页，在页面内使用嵌入式对象浏览器。

不要在一体化镜像中直接打开 `/s3-browser` 创建 S3 connection。该路径只提供给 Admin Console 使用的静态 Module Federation 资源。独立 S3 Browser 的 connection 工作流需要运行单独的 S3 Browser 镜像，它会提供自己的 `/api/connections` API。

## 生产注意事项

- 在带 HTTPS 的反向代理后部署。
- 为每个 BFF 的 `JWT_SECRET` / `ENCRYPTION_KEY` / `ADMIN_PASSWORD` 使用强且唯一的值。
- **轮换 `ENCRYPTION_KEY`：** 该密钥用于加密存储的凭证（集群管理令牌、S3 密钥对）。目前没有自动重新加密机制，更换密钥会导致已有记录无法解密——代理请求和对象浏览器将出错。轮换步骤：停止服务，设置新密钥，重新输入受影响的凭证（编辑每个集群/连接以重新设置令牌或密钥对，使其以新密钥重新加密）。请安排维护窗口；记录较多时视作重新配置处理。
- 控制台面向内部网络部署；生产环境建议增加额外认证层（VPN、SSO）。
- 如果将 Admin SPA 独立于 BFF 静态托管，需在构建前设置 `VITE_S3_BROWSER_MF_URL`。

## 故障排查

**在一体化镜像里添加 S3 connection 返回 404** → 这通常是把独立 S3 Browser UI 连到了 Admin API。一体化镜像不会运行独立 S3 Browser BFF，因此 `/api/connections` 和 `/api/connections/test` 不存在。请在 Admin Console 的存储桶详情页使用嵌入式对象浏览器；如果需要直接管理 S3 connections，请运行独立 S3 Browser 镜像。

**Garage 日志出现 `Forbidden: Garage does not support anonymous access yet` 和 `GET /`** → 这通常是健康检查或反向代理匿名探测 Garage S3 endpoint。Admin Console 的对象浏览器会通过 BFF 发送已签名的 S3 请求；请先查看浏览器 Network 面板里的实际失败请求 URL，再判断这条 Garage 日志是否与应用错误有关。
