---
kind: upgrade-guide
description: Indus Orbit 桌面预览要求独立账户，不再使用上游提供方登录。
---

# Indus Orbit 预览身份

[English](guide.md) | 中文

## 变更

`indus-orbit` 桌面预览命名为 I/O Harness（I/O H）。启动 Host 前要求 Indus Orbit 身份。本配置禁用上游 DeepSeek 账户与直接密钥适配器、账户设置及遥测。自有 I/O 适配器通过验证前不提供模型执行。`official` 配置保持不变。现有数据路径与 `io-ws` 协议保持稳定。

## 迁移

1. 保留旧预览和用户数据。不要将上游账户令牌转移到 Indus Orbit 身份存储。
2. 按[预览参考](../../../indus-orbit-terminal-preview.zh.md)注册自有公开 OAuth 客户端，部署匹配的授权页面及身份令牌限制。
3. 运行 `pnpm run build:indus-orbit`；命名配置负责已注册的公开客户端标识符与回调。更换身份项目需要审查配置及网站注册的变更。不得嵌入客户端密钥或服务密钥。
4. 验证启动会打开 Indus Orbit 登录、缺少配置时不启动 Host、取消不授予身份且退出登录停止工作。分发前在候选发行版验证真实登录与刷新。
