/** Isolated Indus Orbit sign-in window and OS-encrypted refresh credential. */
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, lstat, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron'
import { IndusAuth, indusAuthConfig, type IndusTokenStore } from './indus-auth.ts'

import { indusAuthCopy } from './indus-auth-copy.ts'

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
      additionalArguments: [`--indus-auth-locale=${app.getLocale()}`],
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
    return { state: auth.state }
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
  owner.webContents.once('preload-error', () => {
    dialog.showErrorBox(copy.title, copy.unavailable)
    owner.close()
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
  if (!owner.isDestroyed()) owner.show()
  await authenticated
  finish = undefined
  if (!owner.isDestroyed()) owner.close()
  return auth
}
