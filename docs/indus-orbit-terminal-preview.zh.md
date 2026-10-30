# Indus Orbit Harness 预览

[English](indus-orbit-terminal-preview.md) | 中文

## 概述

本参考说明 I/O Harness（I/O H），即 Indus Orbit 的 DeepSeek Harness 分支，以及本地构建与分发限制。Indus Orbit 使用“The General Intelligence Foundation of India”描述语。I/O API、Harness 和 Community 是独立产品。品牌设置不会合并账户、启用提供方或改变执行权限。

## 目录

- [源码与身份](#source-and-identity)
- [本地构建](#local-build)
- [下载发布](#download-publication)
- [兼容性与署名](#compatibility-and-attribution)
- [开发备注](#dev-note)

<a id="source-and-identity"></a>
## 源码与身份

上游基线是 [dsh-v0.2.1-rc.3](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.3)，于 2026 年 10 月 27 日获取。这是带有本地分支修改的上游候选发行版。先前的 rc.2 检出及其未提交文件已另行保留；它不是当前 Harness 源码。

`indus-orbit` 客户端构建采用右上角配有现有像素 I/O 图案的 `[H]` 标志、醒目的 H 字标、Harness 全称及 Indus Orbit 基金会身份。自有栅格标志由矢量几何图形渲染。[品牌填充包](../packages/client/ui-brand-official/README.zh.md)通过现有插槽填充侧栏和会话首屏。会话处理、工具、插件及智能体循环保留上游架构。

<a id="local-build"></a>
## 本地构建

固定的 Node 与 pnpm 要求见 [package.json](../package.json)。命名构建配置负责公开标题与品牌；继承的任意标题值无法覆盖它：

```sh
pnpm run build:indus-orbit
```

`DSH_BUILD_CLIENT_PROFILE=indus-orbit` 为构建和打包子进程选择同一命名配置。`pnpm run build:official` 保留上游品牌。构建配置选择产物身份；运行时组合仍使用受支持的 `dsh` 配置，例如 `web` 和 Desktop 所有的组合。客户端构建记录将所选值与 Web、动态客户端及原生外壳产物绑定。

原生预览使用文件系统安全名称 `IO Harness`，显示为 I/O Harness。现有 `io-ws` 协议、`local.indusorbit.workstation.preview` 标识符、`IO W-S` Electron 数据目录及 `Indus Orbit Workstation Data/harness` 持久主目录保持稳定，避免丢失本地数据。显式设置 `DSH_HOME` 仍可覆盖 Harness 主目录。

原生 `indus-orbit` 配置在启动 Host 前要求独立的 Indus Orbit OAuth 身份。缺少公开客户端配置时，仅显示隔离的登录窗口，不回退到模型提供方账户。主进程负责 PKCE、绑定 state 的回环回调、有界发行方请求和刷新凭据；渲染进程仅接收电子邮件与身份状态。可用时通过操作系统加密保存刷新凭据，否则仅存于进程内存。退出登录会立即使此设备的身份和模型请求失效，并在等待移除凭据之前开始停止 Host。应用退出会等待停止及凭据清理两项操作完成；Host 停止失败时保留恢复路径，不宣称成功终止。并发退出请求共享同一个操作。其他安装的授权保持不变。支持的回调为 `http://127.0.0.1:43189/indus-auth/callback`。

命名 `indus-orbit` 配置嵌入公开客户端标识符 `cf26c996-8c19-42c6-82ff-f0b6ccafd3ee` 与回调端口 `43189`；继承的公开环境变量无法更改其目标。这些值不是密钥。网站必须部署匹配的授权页面和标识符。启用前，数据库、Storage、Realtime 和 I/O 函数必须拒绝仅用于身份验证的 OAuth 令牌。真实托管登录、刷新和撤销需要另行验收。

可信 Desktop Host 覆盖文件禁用上游 DeepSeek 账户、其账户设置、产品分析和会话遥测。可选的 DeepSeek 直接密钥适配器及 pi-ai 提供方连接仍独立可用。上游 `official` 配置保留自身行为。

自有 I/O 提供方通过主进程回环代理访问模型。OAuth 访问及刷新凭据留在主进程；Host 仅通过私有 IPC 接收随机的内存套接字能力值，环境变量、参数、渲染进程状态及配置文件均不携带该值。代理拒绝浏览器来源及未列出的路由，限制字节、并发和时长，保持 JSON/SSE 字节不变，为每次付费尝试生成唯一标识，并在退出登录或 Host 停止时中止请求。维护中的 pi-ai OpenAI 适配器处理流、工具历史及用量；该资金授权路由禁用自动重试。

新默认选择在用户补丁之前设置为 `indus-orbit` / `io/harness-primary`，保留显式保存的选择及既有会话。经过审查的网关元数据提供容量、指定主模型或所有者批准的临时别名；不会静默回退到其他模型系列。通过应用菜单中的 **连接 I/O 额度…** 完成独立的第一方资金授权。真实资金授权执行验收要求配套网站、后端及合格提供方路由已部署；仅身份登录并不足够。

原生模型传输及提供方检查单独记录在 [I/O 模型验证记录](indus-orbit-model-verification-2026-10-28.json)中。直接提供方测试成功，并不代表已验证真实托管工作区额度授权或公开安装包。

本分支仅允许未签名本地打包。更新器拒绝解析上游更新源和上传目标，安装版更新器及强制更新服务均被禁用。签名凭据、账户和发布目标需要另行审查的分支发行配置。[验证记录](indus-orbit-workstation-verification-2026-10-27.json)列出实际命令、结果及剩余限制；是否已生成或测试安装包以该记录为准。

<a id="download-publication"></a>
## 下载发布

[分发提案](indus-orbit-terminal-distribution.proposal.json)记录发布状态。源码归档和未签名本地安装包不同于已发布且经过资格验证的发行版。只有真实产物字节才能对应文件名、大小或 SHA-256；空产物列表不代表下载。

启用公开网站下载前，发布记录需要分支版本、准确源码修订与补丁摘要、渠道、平台/架构、文件名、字节数、SHA-256、HTTPS 目标、兼容性证据及签名/公证结果。保留 [LICENSE](../LICENSE)、[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)及所有随附许可证声明。

不得将上游安装包作为 I/O Harness 发布。本预览未配置公开的 Indus Orbit 更新或发布端点。[Desktop 参考](../apps/desktop/README.zh.md)负责原生打包与运行时细节。

<a id="compatibility-and-attribution"></a>
## 兼容性与署名

本地验证记录准确范围与主机，不代表其他操作系统或架构已经通过验证。当前会话兼容性见[会话格式状态](session-format-status.zh.md)及[升级指南](upgrade-guide/)。打开旧会话数据前使用独立测试 Harness 主目录，并在副本上验证迁移。

DeepSeek Harness 代码保留 MIT 版权与署名。Indus Orbit 身份标识本分支。提供方账户、费用、同意、沙箱和本地执行仍受其真实配置与策略约束。

<a id="dev-note"></a>
## 开发备注

文件名保留早期 Terminal 引用，使现有本地链接继续有效。标注日期的 rc.2 验证记录是历史证据；验证记录负责当前本地结果。早期 W-S DMG 已暂停发布，不是 I/O Harness 发行版。
