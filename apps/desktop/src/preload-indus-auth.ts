/** Renderer-safe native identity commands; tokens remain in the Electron main process. */
import { contextBridge, ipcRenderer } from 'electron'
import type { IndusAuthState } from './indus-auth.ts'
import { indusAuthCopy } from './indus-auth-copy.ts'

const localePrefix = '--indus-auth-locale='
const locale = process.argv.find(argument => argument.startsWith(localePrefix))?.slice(localePrefix.length)
if (locale === undefined) throw new Error('Indus sign-in: missing window locale')

contextBridge.exposeInMainWorld('indusIdentity', {
  copy: indusAuthCopy(locale),
  read: () =>
    ipcRenderer.invoke('indus-identity:read') as Promise<{
      state: IndusAuthState
    }>,
  start: () => ipcRenderer.invoke('indus-identity:start') as Promise<IndusAuthState>,
  cancel: () => ipcRenderer.invoke('indus-identity:cancel') as Promise<IndusAuthState>,
  onState: (listener: (state: IndusAuthState) => void) => {
    const receive = (_event: Electron.IpcRendererEvent, state: IndusAuthState): void => {
      listener(state)
    }
    ipcRenderer.on('indus-identity:state', receive)
    return () => {
      ipcRenderer.removeListener('indus-identity:state', receive)
    }
  },
})
