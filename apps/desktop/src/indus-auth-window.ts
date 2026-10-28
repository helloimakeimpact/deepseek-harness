/** Isolated Indus Orbit sign-in window and OS-encrypted refresh credential. */
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, lstat, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain, safeStorage, shell } from 'electron'
import { IndusAuth, indusAuthConfig, type IndusTokenStore } from './indus-auth.ts'

/** Locale-owned native authentication copy; provider sign-in is not an identity option. */
export function indusAuthCopy(language: string) {
  const en = {
    title: 'I/O Harness — Indus Orbit',
    credits: 'Connect I/O credits…',
    brand: 'I/O H',
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
    failed: 'Sign-in could not finish. Check your connection and try again.',
  }
  return language.startsWith('zh')
    ? {
      ...en,
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

function encryptedStore(clientId: string): IndusTokenStore {
  const path = join(app.getPath('userData'), 'indus-orbit-identity.enc')
  const available = (): boolean =>
    safeStorage.isEncryptionAvailable() &&
    (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text')
  return {
    async read() {
      if (!available()) return undefined
      let bytes: Buffer
      try {
        const status = await lstat(path)
        if (!status.isFile() || status.isSymbolicLink() || status.size > 16384)
          throw new Error('Indus identity store exceeds limit')
        bytes = await readFile(path)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
        throw error
      }
      const record: unknown = JSON.parse(safeStorage.decryptString(bytes))
      if (
        typeof record !== 'object' ||
        record === null ||
        !('clientId' in record) ||
        record.clientId !== clientId ||
        !('refresh' in record) ||
        typeof record.refresh !== 'string' ||
        record.refresh.length > 4096
      )
        throw new Error('Indus identity store is invalid')
      return record.refresh
    },
    async write(refresh) {
      if (!available()) return
      await mkdir(app.getPath('userData'), { recursive: true, mode: 0o700 })
      const bytes = safeStorage.encryptString(JSON.stringify({ version: 1, clientId, refresh }))
      const temporary = `${path}.${randomBytes(12).toString('hex')}.pending`
      await writeFile(temporary, bytes, { mode: 0o600, flag: 'wx' })
      try {
        await rename(temporary, path)
      } finally {
        await rm(temporary, { force: true })
      }
    },
    async clear() {
      await rm(path, { force: true })
    },
  }
}

/**
 * Require the owned account before any Harness Host or provider adapter starts.
 * Missing configuration remains in this isolated window without an upstream fallback.
 */
export async function requireIndusIdentity(onLost: () => Promise<void>): Promise<IndusAuth> {
  const config = indusAuthConfig({
    DSH_CLIENT_INDUS_OAUTH_CLIENT_ID: process.env.DSH_CLIENT_INDUS_OAUTH_CLIENT_ID,
    DSH_CLIENT_INDUS_OAUTH_CALLBACK_PORT: process.env.DSH_CLIENT_INDUS_OAUTH_CALLBACK_PORT,
  })
  const copy = indusAuthCopy(app.getLocale())
  let window: BrowserWindow | undefined
  let finish: (() => void) | undefined
  const auth = new IndusAuth({
    config,
    store: encryptedStore(config?.clientId ?? 'unconfigured'),
    open: url => shell.openExternal(url),
    lost: onLost,
    notify: (state) => {
      window?.webContents.send('indus-identity:state', state)
      if (state === 'signed-in') finish?.()
    },
  })
  await auth.restore()
  app.once('will-quit', () => {
    auth.dispose()
  })
  if (auth.state === 'signed-in') return auth
  window = new BrowserWindow({
    width: 560,
    height: 620,
    title: copy.title,
    show: false,
    resizable: false,
    webPreferences: {
      preload: fileURLToPath(new URL('./preload-indus-auth.cjs', import.meta.url)),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  })
  const owner = window
  const check = (event: Electron.IpcMainInvokeEvent): void => {
    if (owner.isDestroyed() || event.sender !== owner.webContents || event.senderFrame !== owner.webContents.mainFrame)
      throw new Error('Rejected Indus identity action from unowned frame')
  }
  ipcMain.handle('indus-identity:read', (event) => {
    check(event)
    return { copy, state: auth.state }
  })
  ipcMain.handle('indus-identity:start', async (event) => {
    check(event)
    await auth.start()
    return auth.state
  })
  ipcMain.handle('indus-identity:cancel', async (event) => {
    check(event)
    await auth.cancel()
    return auth.state
  })
  owner.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  owner.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })
  owner.once('closed', () => {
    for (const channel of ['indus-identity:read', 'indus-identity:start', 'indus-identity:cancel'])
      ipcMain.removeHandler(channel)
    window = undefined
    if (auth.state !== 'signed-in') {
      auth.dispose()
      app.quit()
    }
  })
  const authenticated = new Promise<void>((resolve) => {
    finish = resolve
  })
  await owner.loadFile(join(app.getAppPath(), 'renderer', 'indus-auth.html'))
  owner.show()
  await authenticated
  finish = undefined
  owner.close()
  return auth
}
