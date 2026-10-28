/** Renderer-safe native identity commands; tokens remain in the Electron main process. */
import { contextBridge, ipcRenderer } from 'electron'
import type { IndusAuthState } from './indus-auth.ts'
import type { indusAuthCopy } from './indus-auth-window.ts'

contextBridge.exposeInMainWorld('indusIdentity', {
  read: () =>
    ipcRenderer.invoke('indus-identity:read') as Promise<{
      copy: ReturnType<typeof indusAuthCopy>
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
