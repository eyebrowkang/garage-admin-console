# Garage Admin Console

[English](./README.md) | [中文](./README_zh.md)

一个现代化的 Web 管理界面，用于管理 [Garage](https://garagehq.deuxfleurs.fr/)
分布式对象存储集群，附带 **S3 Browser** 用于管理任何 S3 兼容存储中的对象。

这两个应用既可以分别部署，也可以组合成一个镜像运行。在 combined 拓扑下，Admin Console
仍然是唯一可见的产品壳，S3 Browser 则通过 Module Federation 和 `/s3-api` 代理以嵌入能力的形式存在。

> 兼容 Garage Admin API v2。
>
> **版本说明**：主版本号与 Garage Admin API 版本同步。v2.x 对应 Admin API v2。没有 v1.0 或 v0.x — 本项目创建时 Admin API v1 和 v0 均已废弃。

## 功能特性

### Admin Console（集群管理）

- **多集群管理** — 在单一仪表盘中连接和管理多个 Garage 集群
- **实时监控** — 集群健康状态、节点状态和容量可视化
- **存储桶管理** — 创建、配置和删除存储桶，支持配额和网站托管
- **访问密钥管理** — 生成、导入和管理 S3 兼容的访问密钥
- **权限控制** — 细粒度的存储桶-密钥权限矩阵
- **节点与布局** — 监控节点，配置集群拓扑，支持暂存变更
- **数据块与 Worker** — 数据块错误管理、Worker 监控、性能调优
- **管理令牌** — 管理具有作用域权限的 API 令牌
- **安全存储** — 使用 AES-256-GCM 加密凭证存储

### S3 Browser（对象浏览器）

- **S3 兼容** — 支持 Garage、AWS S3、MinIO 及任何 S3 兼容存储
- **连接管理** — 保存多个端点，凭证加密存储
- **对象浏览** — 文件夹导航、上传（拖放，最大 5 GB）、下载、删除
- **Module Federation** — 可嵌入组件，集成到 Admin Console 中使用
- **独立部署** — 既可独立运行，也可作为 Admin 背后的嵌入运行时

## 快速开始（Docker）

### 仅 Admin Console

```bash
docker compose up -d
```

访问 **http://localhost:3001**。先编辑 `docker-compose.yml` 设置必需的环境变量。

### 仅 S3 Browser

```bash
docker build -t s3-browser -f docker/s3-browser.Dockerfile .
docker run -d -p 3002:3002 -v s3-data:/data \
  -e JWT_SECRET=change-me-to-a-random-string \
  -e ENCRYPTION_KEY=change-me-exactly-32-characters! \
  -e ADMIN_PASSWORD=change-me-admin-password \
  s3-browser
```

访问 **http://localhost:3002**。

### Combined：Admin + 内嵌 S3 Browser

```bash
docker build -t garage-admin-combined -f docker/combined.Dockerfile .
docker run -d -p 3001:3001 -v combined-data:/data \
  -e JWT_SECRET=change-me-to-a-random-string \
  -e ENCRYPTION_KEY=change-me-exactly-32-characters! \
  -e ADMIN_PASSWORD=change-me-admin-password \
  garage-admin-combined
```

访问 Admin 壳：**http://localhost:3001**。

在这种模式下：

- 浏览器里只有 Admin Console 这一层壳
- S3 Browser 的远程资源通过 `/s3-browser/remoteEntry.js` 暴露
- S3 Browser API 请求通过 `/s3-api/*` 同源代理
- 独立的 S3 Browser SPA 路由树会被刻意隐藏

### 必需环境变量

| 变量 | 说明 |
|------|------|
| `JWT_SECRET` | 用于 JWT 签名的随机字符串 |
| `ENCRYPTION_KEY` | 恰好 32 个字符，用于 AES-256 加密 |
| `ADMIN_PASSWORD` | 控制台登录密码 |

完整的部署模式和 Docker Compose 示例请参阅[部署指南](./docs/deployment.md)。
远程入口和 `/s3-api` 契约请参阅 [Module Federation 指南](./docs/module-federation.md)。

## 开发设置

### 前置条件

- Node.js 24+
- pnpm 10+

### 安装

```bash
git clone https://github.com/eyebrowkang/garage-admin-console.git
cd garage-admin-console

pnpm install
pnpm approve-builds    # 如果提示需要批准原生构建
```

### 配置

```bash
# Admin Console
cp apps/admin/api/.env.example apps/admin/api/.env

# S3 Browser
cp apps/s3-browser/api/.env.example apps/s3-browser/api/.env
```

编辑两个 `.env` 文件 — `JWT_SECRET`、`ENCRYPTION_KEY` 和 `ADMIN_PASSWORD` 为必填项。

### 运行

```bash
pnpm dev              # 同时启动所有应用
pnpm dev:admin        # 仅 Admin（API: 3001, Web: 5173）
pnpm dev:s3           # 仅 S3 Browser（API: 3002, Web: 5174）
```

数据库在首次启动时自动创建，无需手动迁移。

## 项目结构

```
garage-admin-console/
├── apps/
│   ├── admin/
│   │   ├── api/              # Admin BFF（Express 5, Drizzle ORM, SQLite）
│   │   └── web/              # Admin SPA（React 19, Vite）— MF Host
│   └── s3-browser/
│       ├── api/              # S3 Browser BFF（Express 5, AWS SDK v3, SQLite）
│       └── web/              # S3 Browser SPA（React 19, Vite）— MF Remote
├── packages/
│   ├── auth/                 # 共享 JWT 认证中间件
│   ├── ui/                   # 共享 UI 组件（shadcn/ui）
│   └── tsconfig/             # 共享 TypeScript 配置
├── docker/                   # Dockerfile（admin、s3-browser、combined）
├── docs/                     # 文档
└── e2e/                      # Playwright 端到端测试
```

## 常用脚本

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动所有开发服务器 |
| `pnpm dev:admin` | 仅启动 Admin API + Web |
| `pnpm dev:s3` | 仅启动 S3 Browser API + Web |
| `pnpm build` | 构建所有包 |
| `pnpm lint` | 检查所有包 |
| `pnpm format` | 使用 Prettier 格式化代码 |
| `pnpm typecheck` | 类型检查所有包 |
| `pnpm test` | 运行所有测试 |
| `npx playwright test` | 运行端到端测试 |

## 文档

| 文档 | 说明 |
|------|------|
| [架构设计](./docs/architecture.md) | 系统架构、BFF 模式、数据流图 |
| [部署指南](./docs/deployment.md) | Docker 部署模式及 Compose 示例 |
| [Module Federation](./docs/module-federation.md) | MF 集成指南 |
| [S3 Browser](./docs/s3-browser.md) | S3 Browser 功能、API 参考、配置 |
| [开发指南](./DEVELOPMENT.md) | 开发环境设置、项目结构、代码风格 |
| [贡献指南](./CONTRIBUTING.md) | 贡献流程、提交规范 |

## 安全注意事项

- 生产环境应部署在带有 HTTPS 的反向代理之后
- 为所有密钥使用强且唯一的值
- 设计用于内部网络部署
- 生产环境建议使用 VPN 或额外认证层

## 部署备注

- 如果 Admin 要嵌入一个外部部署的 S3 Browser remote，构建 Admin 镜像时需要传入
  `VITE_S3_BROWSER_REMOTE_ENTRY=https://<host>/remoteEntry.js`。
- Admin API 的运行时环境变量 `S3_BROWSER_API_URL` 必须指向 S3 Browser 的基础 URL，
  不要追加 `/api`。
- 在 combined 模式下，`/s3-browser/` 和 `/s3-browser/connections` 应返回
  `404 Not Found`；这里应该只暴露 MF 远程资源，不应暴露独立的 S3 Browser 壳。

## 许可证

采用 [AGPL-3.0](./LICENSE) 许可，与 Garage 项目一致。

来自 [Garage 项目](https://git.deuxfleurs.fr/Deuxfleurs/garage)的资源（`apps/admin/web/public/` 中的 Logo、OpenAPI 规范）受 Garage 自身许可条款约束。
