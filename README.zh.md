# Garage Admin Console

[English](./README.md) | [中文](./README.zh.md)

一个现代化的 Web 管理界面，用于管理 [Garage](https://garagehq.deuxfleurs.fr/) 分布式对象存储集群。通过统一的仪表盘监控集群健康状态、管理存储桶和访问密钥、配置布局等。

> 兼容 Garage Admin API v2。
>
> **版本说明**：本项目的主版本号与 Garage Admin API 版本保持同步。v2.x 对应 Admin API v2。没有 v1.0 或 v0.x — 本项目创建时 Admin API v1 和 v0 均已废弃，因此不做支持。

## 功能特性

- **多集群管理** - 在单一界面中连接和管理多个 Garage 集群
- **仪表盘概览** - 实时集群健康状态、节点状态和容量可视化
- **存储桶管理** - 创建、配置和删除存储桶，支持配额和网站托管选项
- **访问密钥管理** - 生成、导入和管理 S3 兼容的访问密钥
- **权限控制** - 细粒度的存储桶-密钥权限矩阵，支持读/写/所有者权限切换
- **节点监控** - 查看节点状态、统计信息并触发维护操作
- **布局管理** - 配置集群拓扑，支持暂存变更和应用前预览
- **数据块操作** - 监控数据块错误、重试失败的同步操作并管理数据完整性
- **Worker 管理** - 监控后台工作进程并配置性能参数
- **管理令牌管理** - 管理具有作用域权限的 API 令牌
- **安全凭证存储** - 使用 AES-256-GCM 加密存储 Garage 管理令牌

## 快速开始（Docker）

使用 Docker 是运行控制台最简单的方式。单个镜像同时包含前端和 API。

### 使用 Docker Compose

```bash
# 克隆仓库
git clone https://github.com/eyebrowkang/garage-admin-console.git
cd garage-admin-console

# 编辑 docker-compose.yml — 修改三个必需的环境变量
# 然后启动服务：
docker compose up -d
```

控制台访问地址：**http://localhost:3001**

查看 `docker-compose.yml` 了解所有可用选项。至少需要设置以下变量：

| 变量 | 说明 |
|------|------|
| `JWT_SECRET` | 用于 JWT 签名的随机字符串 |
| `ENCRYPTION_KEY` | 恰好 32 个字符，用于 AES-256 加密 |
| `ADMIN_PASSWORD` | 控制台登录密码 |

数据持久化在 `/data` 卷中（SQLite 数据库）。

### 使用 Docker Run

```bash
docker build -t garage-admin-console .

docker run -d \
  -p 3001:3001 \
  -v garage-data:/data \
  -e JWT_SECRET=change-me-to-a-random-string \
  -e ENCRYPTION_KEY=change-me-exactly-32-characters! \
  -e ADMIN_PASSWORD=change-me-admin-password \
  garage-admin-console
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

# 如果 pnpm 阻止原生构建（Prisma）
pnpm approve-builds
```

### 配置

从提供的模板创建 API 环境文件：

```bash
cp api/.env.example api/.env
```

编辑 `api/.env` 配置你的设置。查看 `api/.env.example` 了解所有可用变量及其说明。`JWT_SECRET`、`ENCRYPTION_KEY` 和 `ADMIN_PASSWORD` 是必需的 — 如果缺少任何一个，API 将拒绝启动。

### 数据库设置

```bash
pnpm -C api db:push
```

数据库文件将自动创建在 `api/data.db`。

### 运行

```bash
pnpm dev
```

- 前端：http://localhost:5173
- API：http://localhost:3001

### 生产构建

```bash
pnpm build
pnpm -C api start
```

使用你偏好的 Web 服务器（Nginx、Caddy 等）提供 `web/dist/` 的静态文件服务，并配置反向代理将 `/api/*` 路由转发到 API 服务器。

## 项目结构

```
garage-admin-console/
├── api/                 # Backend-For-Frontend 服务（Express + Prisma）
├── web/                 # 前端单页应用（React + Vite）
├── e2e/                 # 端到端测试（Playwright）
└── web/public/garage-admin-v2.json  # Garage Admin API OpenAPI 规范
```

## 架构

控制台采用 Backend-For-Frontend（BFF）代理模式：

```
浏览器 → 前端 → BFF API → Garage 集群
```

- **认证**：单一管理员密码 → JWT 令牌（24 小时有效期）
- **凭证安全**：Garage 管理令牌使用 AES-256-GCM 加密存储
- **代理模式**：前端不直接与 Garage 集群通信

## 文档

- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - 贡献指南
- **[DEVELOPMENT.md](./DEVELOPMENT.md)** - 开发者指南，包含架构详情和测试

## 常用脚本

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动开发服务器 |
| `pnpm build` | 生产构建 |
| `pnpm lint` | 运行 ESLint |
| `pnpm format` | 使用 Prettier 格式化代码 |
| `pnpm -C web test` | 运行单元测试 |
| `npx playwright test` | 运行端到端测试 |
| `pnpm -C api db:push` | 推送数据库架构 |
| `pnpm -C api db:studio` | 打开 Prisma Studio GUI |

## 安全注意事项

- 生产环境中应部署在带有 HTTPS 的反向代理之后
- 为 `JWT_SECRET`、`ENCRYPTION_KEY` 和 `ADMIN_PASSWORD` 使用强且唯一的值
- 控制台设计用于内部网络部署
- 生产环境中建议考虑额外的认证层（VPN、SSO）

## 许可证

本项目采用 GNU Affero 通用公共许可证 v3.0（AGPL-3.0）授权，
与 Garage 项目保持一致。完整条款请参阅 `LICENSE` 文件。

以下资源来源于 Garage 项目仓库，受 Garage 自身许可条款约束：

- `web/public/garage.svg`、`web/public/garage.png`、`web/public/garage-notext.svg` 和 `web/public/garage-notext.png` 中的 Logo 资源
- `web/public/garage-admin-v2.json` 中的 OpenAPI 规范
