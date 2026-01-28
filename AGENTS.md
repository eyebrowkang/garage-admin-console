# AGENTS.md

## 项目介绍

本项目是一个[Garage](https://garagehq.deuxfleurs.fr/)管理控制台，用于管理Garage集群，用于内网部署。

## 项目架构

项目采用前端+BFF的架构，前端不可直接访问集群。由于设计部署在内网，因此项目自身鉴权逻辑简单轻量，确保Garage集群的token加密存储不泄露即可。

对于详细的技术栈不做限制。

## 项目要求

- 符合最佳实践
- 类型安全
- 样式美观、现代
- 交互人性化
- 逻辑清晰简单
- 能够管理多个集群
- API对接完善，所有管理API均需要支持

## 参考文档

所有API均以[Garage OpenAPI](./garage-admin-v2.json)为基础构建
