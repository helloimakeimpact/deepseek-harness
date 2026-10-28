---
description: "按构建选择 DeepSeek Harness 或 Indus Orbit 品牌填充；供维护者选择客户端身份并检查 slot 生命周期。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-official

[English](README.md) | 中文

## 概述

本分支让 `indus-orbit` 客户端构建在侧栏和会话首屏显示大写 I/O 像素标志，并突出显示 H 字标、Harness 全称及 Indus Orbit 基金会身份。`official` profile 保留 DeepSeek Harness 品牌；未选择的 profile 保留外壳回退。本包不保留运行时状态，也不影响模型请求。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

随附的 Web bundle 已挂载本插件。命名构建配置 `DSH_BUILD_CLIENT_PROFILE=indus-orbit` 负责 I/O Harness 标题与公开身份；`official` 保留上游身份。[Indus Orbit 预览参考](../../../docs/indus-orbit-terminal-preview.zh.md)说明本分支的分发限制。

### 选择 profile

`DSH_CLIENT_BUILD_PROFILE` 选择填充。`indus-orbit` 一起填充侧栏标志、名称和首屏标志。其由代码绘制的大写 I/O 栅格主文件保持静止，会话语言字典在两种界面语言中使用获准的英文品牌语句。`official` 只填充上游侧栏；其他值不注册填充。所有 profile 都会校验插件。

### 替换品牌

其他身份可省略本包并挂载替代填充包。本分支和替代包都无需重写通用侧栏、执行控件或会话状态。构建期品牌选择不会连接 Messaging 账户或启用提供方。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

每组填充通过嵌套的 `ctx.slots.inject()` 调用安装。Indus Orbit 还等待首屏声明；任一所需声明消失时三个填充一并撤回，重新声明后恢复，HMR 期间不会留下残缺的品牌混合。浏览器半部是 [`src/client/index.ts`](src/client/index.ts)；node 半部是一个空 Loader 座位。浏览器标题是构建环境的事（`DSH_CLIENT_TITLE`），不在 slot 系统之内。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当品牌面不够用时阅读以下页面。它们从本包占据的 slot 进入渲染这些 slot 的外壳。

- [ui-sidebar](../ui-sidebar/README.zh.md)——声明 `sidebar.brand.mark` 与 `sidebar.brand.name` 并渲染其回退。
- [ui-conversation](../ui-conversation/README.zh.md)——在首屏声明 `conversation.hero.brand.mark`。
- [Web 客户端架构](../../../docs/subsystems/web-client.zh.md)——浏览器插件行如何加载并注册 slot。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本包只贡献浏览器呈现；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；本包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制界定了品牌呈现的供给方式。它们是当前包约束，不是品牌设计对比或任务积压。

- **按构建选择身份**——其他身份需要明确的构建 profile 或替代填充包。
- **浏览器标题独立**——`DSH_CLIENT_TITLE` 在构建时选择标题文本，而非通过 UI slot。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
