/**
 * Locale-owned native authentication copy; no provider account is an identity option.
 * @param language - Operating-system language tag.
 * @returns Sign-in labels, actions and failure instructions for the native window.
 */
export function indusAuthCopy(language: string) {
  const en = {
    title: 'I/O Harness — Indus Orbit',
    credits: 'Connect I/O credits…',
    brand: '[H]',
    poweredBy: 'Powered by I/O',
    expansion: 'I/O Harness',
    line: 'Intelligence, built together.',
    intro: 'Sign in with your Indus Orbit account.',
    start: 'Sign in with Indus Orbit',
    cancel: 'Cancel sign-in',
    signOut: 'Sign out of Indus Orbit',
    unconfigured:
      'Indus Orbit sign-in is not configured for this build. A registered desktop client and the Indus Orbit consent page are required. No provider account will be opened.',
    'signed-out': 'Your browser will open Indus Orbit sign-in and ask you to approve this device.',
    waiting: 'Finish signing in and approving I/O Harness in your browser.',
    'signed-in': 'Signed in to Indus Orbit.',
    loading: 'Preparing Indus Orbit sign-in…',
    unavailable: 'Sign-in could not load. Close and reopen I/O Harness. If this continues, install a fresh copy.',
    failed: 'Sign-in could not finish. Check your connection and try again.',
  }
  return language.startsWith('zh')
    ? {
      ...en,
      poweredBy: '由 I/O 提供支持',
      loading: '正在准备 Indus Orbit 登录…',
      unavailable: '无法加载登录。请关闭并重新打开 I/O Harness。如仍无法加载，请重新安装。',
      intro: '使用您的 Indus Orbit 账号登录。',
      credits: '连接 I/O 额度…',
      start: '使用 Indus Orbit 登录',
      cancel: '取消登录',
      signOut: '退出 Indus Orbit',
      unconfigured:
          '此构建尚未配置 Indus Orbit 登录。需要注册桌面客户端并启用 Indus Orbit 授权页面。不会打开模型提供方账号。',
      'signed-out': '浏览器将打开 Indus Orbit 登录页面，并请求您授权此设备。',
      waiting: '请在浏览器中完成登录并授权 I/O Harness。',
      'signed-in': '已登录 Indus Orbit。',
      failed: '无法完成登录。请检查网络连接后重试。',
    }
    : en
}
