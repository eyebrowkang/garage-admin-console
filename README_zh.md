# Garage Admin Console

[English](./README.md) | [中文](./README_zh.md)

一个现代化的 Web 管理界面，用于管理 [Garage](https://garagehq.deuxfleurs.fr/) 分布式对象存储集群。通过统一的仪表盘监控集群健康状态、管理存储桶和访问密钥、配置布局，**并通过嵌入式 S3 文件浏览器直接浏览和上传对象**。

> 兼容 Garage Admin API v2。
>
> **版本说明**：本项目的主版本号与 Garage Admin API 版本保持同步。v2.x 对应 Admin API v2。没有 v1.0 或 v0.x — 本项目创建时 Admin API v1 和 v0 均已废弃，因此不做支持。

## 功能特性

- **多集群管理** - 在单一界面中连接和管理多个 Garage 集群
- **仪表盘概览** - 实时集群健康状态、节点状态和容量可视化
- **存储桶管理** - 创建、配置和删除存储桶，支持配额和网站托管选项
- **嵌入式对象浏览器** - 在任意桶内浏览、上传、签发预签名链接、删除对象，由通过 Module Federation 2.0 联邦的 S3 Browser 模块提供
- **访问密钥管理** - 生成、导入和管理 S3 兼容的访问密钥
- **权限控制** - 细粒度的存储桶-密钥权限矩阵，支持读/写/所有者权限切换
- **节点监控** - 查看节点状态、统计信息并触发维护操作
- **布局管理** - 配置集群拓扑，支持暂存变更和应用前预览
- **数据块操作** - 监控数据块错误、重试失败的同步操作并管理数据完整性
- **Worker 管理** - 监控后台工作进程并配置性能参数
- **管理令牌管理** - 管理具有作用域权限的 API 令牌
- **安全凭证存储** - 使用 AES-256-GCM 加密存储 Garage 管理令牌与 S3 密钥

## 仓库结构

本仓库是单一 pnpm workspace，包含两个产品 + 三个共享包：

```
garage-admin-console/
├── garage-admin-console/   # Admin Console 产品
│   ├── api/                # BFF（Express + Drizzle + LibSQL）
│   └── web/                # 前端 SPA（React + Vite） — Module Federation Host
├── s3-browser/             # 独立 S3 浏览器产品（可作为 MF Remote 被嵌入）
│   ├── api/                # BFF（与 Admin api 同栈）
│   └── web/                # 前端 SPA（React + Rsbuild）
├── packages/
│   ├── tokens/             # @garage/tokens — CSS 变量 + 色板
│   ├── ui/                 # @garage/ui — 共享 UI 原件
│   └── bucket-api-contract-tests/   # Bucket Backend API 回归测试套件
├── designs/                # 历史设计稿（归档）
└── e2e/                    # Playwright 测试
```

## 快速开始（Docker）

Docker 部署刻意保持可组合：

- **仅 Admin**：只运行 Admin Console 镜像。桶页面仍可使用；S3 Browser remote 不可达时会显示降级提示。
- **独立 S3 Browser**：只运行 S3 Browser 镜像。它自己提供 API、SPA 和 MF remote。
- **嵌入式合并部署**：运行两个产品镜像。Admin 运行时接收 `S3_BROWSER_MF_URL`，并把 `/s3-browser/*` 代理到 S3 Browser 容器，所以只需要发布 Admin 端口。

### 使用 Docker Compose

```bash
git clone https://github.com/eyebrowkang/garage-admin-console.git
cd garage-admin-console

cp docker/.env.compose.example docker/.env
# 编辑 docker/.env — 启动前替换所有 secret
docker compose -f docker/docker-compose.yml --env-file docker/.env up -d --build
```

使用 `docker/.env.compose.example` 中的默认 compose profile 时，Admin 访问地址为 **http://localhost:3001**，并通过 **http://localhost:3001/s3-browser/mf-manifest.json** 代理 S3 Browser remote。S3 Browser 容器仅保留在 Compose 内部网络。

查看 `docker/docker-compose.yml` 与 `docker/.env.compose.example` 了解所有可用选项。至少需要设置以下变量：

| 变量                          | 说明                                         |
| ----------------------------- | -------------------------------------------- |
| `GARAGE_ADMIN_JWT_SECRET`     | 用于 Admin JWT 签名的随机字符串              |
| `GARAGE_ADMIN_ENCRYPTION_KEY` | 恰好 32 个字符，用于 Admin AES-256 存储      |
| `GARAGE_ADMIN_PASSWORD`       | Admin Console 登录密码                       |
| `S3_BROWSER_MF_URL`           | 浏览器可访问的 S3 Browser manifest           |
| `S3_BROWSER_MF_PROXY_TARGET`  | Admin 代理使用的 Compose 内部 S3 Browser URL |

设置 `COMPOSE_PROFILES=` 可以只部署 Admin。设置 `COMPOSE_PROFILES=s3-browser` 时，S3 Browser 镜像以 `S3_BROWSER_STATIC_ONLY=true` 模式运行，只提供 Admin 嵌入所需的 MF/static 资源。独立部署 S3 Browser 时使用同一个镜像，不设置 `S3_BROWSER_STATIC_ONLY`，并提供它自己的 secret。

数据持久化在具名 Docker 卷中（SQLite 数据库）。

### 使用 Docker Run

```bash
docker build -f docker/garage-admin-console.Dockerfile -t garage-admin-console .

docker run -d \
  -p 3001:3001 \
  -v garage-data:/data \
  -e JWT_SECRET=change-me-to-a-random-string \
  -e ENCRYPTION_KEY=change-me-exactly-32-characters! \
  -e ADMIN_PASSWORD=change-me-admin-password \
  garage-admin-console
```

独立 S3 Browser 也只使用一个镜像：

```bash
docker build -f docker/s3-browser.Dockerfile -t s3-browser .

docker run -d \
  -p 3002:3002 \
  -v s3-browser-data:/data \
  -e JWT_SECRET=change-me-to-a-random-string \
  -e ENCRYPTION_KEY=change-me-exactly-32-characters! \
  -e ADMIN_PASSWORD=change-me-admin-password \
  s3-browser
```

## 开发设置

### 前置条件

- Node.js 24+
- pnpm 10+

### 安装

```bash
git clone https://github.com/eyebrowkang/garage-admin-console.git
cd garage-admin-console

pnpm install

# 如果 pnpm 阻止原生构建
pnpm approve-builds
```

### 配置

```bash
cp garage-admin-console/api/.env.example garage-admin-console/api/.env
# （可选）同时启用 S3 Browser BFF：
cp s3-browser/api/.env.example s3-browser/api/.env
```

编辑各自 `.env`。两个 BFF 都需要 `JWT_SECRET`、`ENCRYPTION_KEY`、`ADMIN_PASSWORD`，缺一不可。

### 数据库设置

迁移在 BFF 启动时自动执行。如需手动应用：

```bash
pnpm -C garage-admin-console/api db:push       # Admin BFF
pnpm -C s3-browser/api db:push                 # S3 Browser BFF（可选）
```

数据库文件自动创建在 `garage-admin-console/api/data.db` 和 `s3-browser/api/data.db`。

### 运行

```bash
# Admin Console（api :3001 + web :5173）
pnpm dev

# 另开一个终端，可选地启动 S3 Browser：
pnpm -C s3-browser/api dev    # BFF :3002
pnpm -C s3-browser/web dev    # web :5174 — 提供 MF remoteEntry

# Admin Console 的 BucketDetail 页面会自动从
# http://localhost:5174/mf-manifest.json 拉取联邦化的 FileBrowser。
```

- Admin Console：http://localhost:5173
- Admin BFF：http://localhost:3001
- S3 Browser：http://localhost:5174
- S3 Browser BFF：http://localhost:3002

### 生产构建

```bash
pnpm build                                  # 共享包 + Admin api + Admin web
pnpm -C s3-browser/api build                # （可选）S3 Browser BFF
pnpm -C s3-browser/web build                # （可选）S3 Browser web（产出 MF 清单）

pnpm -C garage-admin-console/api start
```

使用任意 Web 服务器（Nginx、Caddy 等）托管 `garage-admin-console/web/dist/`，并将 `/api/*` 反向代理到 Admin BFF。若由 Admin BFF 托管构建后的 SPA，运行时设置 `S3_BROWSER_MF_URL` 即可；若将 SPA 单独静态托管，则在构建 Admin web 前设置 `VITE_S3_BROWSER_MF_URL`。

## 架构

控制台采用 Backend-For-Frontend（BFF）代理模式：

```
浏览器 → Admin Web ──→ Admin BFF ──→ Garage 集群 Admin API
                                  └─→ Garage S3 端点（按桶签发临时密钥）
        └─→ （联邦）S3 Browser FileBrowser 远端
```

- **认证**：每个 BFF 单一管理员密码 → JWT（24 小时有效期）
- **凭证安全**：Garage 管理令牌与 S3 密钥均使用 AES-256-GCM 加密存储
- **代理模式**：前端不直接与 Garage / S3 端点通信
- **嵌入式浏览器**：Admin 的桶页面用集群 admin token 调用 Garage `CreateKey + AllowBucketKey` 临时签发桶级 S3 密钥，再转发 Bucket Backend API 请求

## 文档

- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - 贡献指南
- **[DEVELOPMENT.md](./DEVELOPMENT.md)** - 开发者指南（架构、测试、MF 配置）
- **[AGENTS.md](./AGENTS.md)** - 面向 Agent 的总览（新人优先阅读）

## 常用脚本

| 命令                                                        | 说明                                   |
| ----------------------------------------------------------- | -------------------------------------- |
| `pnpm dev`                                                  | 启动 Admin api + web（并行）           |
| `pnpm -C s3-browser/api dev` / `pnpm -C s3-browser/web dev` | 启动 S3 Browser BFF / web              |
| `pnpm build`                                                | 构建共享包 + Admin api + web           |
| `pnpm lint` / `pnpm format`                                 | Admin 包的 lint / 格式化               |
| `pnpm test`                                                 | Admin api + web 的 Vitest              |
| `pnpm -C packages/bucket-api-contract-tests test:run`       | Bucket Backend API 回归测试（env-gated）|
| `npx playwright test`                                       | Admin Console 端到端测试               |
| `pnpm -C garage-admin-console/api db:push`                  | 应用 Admin 库结构                      |
| `pnpm -C garage-admin-console/api db:studio`                | 打开 Admin 库的 Drizzle Studio         |

## 安全注意事项

- 生产环境中应部署在带有 HTTPS 的反向代理之后
- 为每个 BFF 的 `JWT_SECRET`、`ENCRYPTION_KEY` 和 `ADMIN_PASSWORD` 使用强且唯一的值
- 控制台设计用于内部网络部署
- 生产环境中建议考虑额外的认证层（VPN、SSO）

## 许可证

本项目采用 GNU Affero 通用公共许可证 v3.0（AGPL-3.0）授权，
与 Garage 项目保持一致。完整条款请参阅 `LICENSE` 文件。

### Logo 资源

`garage-admin-console/web/public/` 下的 Garage Admin Console Logo 资源以及 `s3-browser/web/public/` 下的 S3 Browser Logo 资源版权归 [eyebrowkang](https://github.com/eyebrowkang) 所有，并随本项目以 AGPL-3.0 许可证发布。

### 第三方资源

- `garage-admin-console/web/public/garage-admin-v2.json` 中的 OpenAPI 规范来源于
  [Garage 项目仓库](https://git.deuxfleurs.fr/Deuxfleurs/garage)，
  受 Garage 自身许可条款约束。
