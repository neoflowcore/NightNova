import { BrowserWindow, ipcMain } from 'electron'
import { NightnovaCoordinator } from './coordinator'
import type { NightnovaConfig } from '../../shared/nightnova'

// Never attach this privileged API to an untrusted webview. Only the trusted
// application window may invoke Nightnova IPC endpoints.
export function registerNightnovaIpc(getWindow: () => BrowserWindow | null): NightnovaCoordinator {
  const coordinator = new NightnovaCoordinator((snapshot) => {
    const win = getWindow()
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('nightnova:state', snapshot)
    }
  })
  const guard = (event: Electron.IpcMainInvokeEvent): void => {
    const win = getWindow()
    if (!win || event.sender !== win.webContents) throw new Error('Nightnova IPC 권한 없음')
  }
  ipcMain.handle('nightnova:state', (event) => { guard(event); return coordinator.state() })
  ipcMain.handle('nightnova:choose-workspace', (event) => {
    guard(event)
    const win = getWindow()
    if (!win) throw new Error('앱 창이 닫혔습니다.')
    return coordinator.chooseWorkspace(win)
  })
  ipcMain.handle('nightnova:configure', (event, patch: Partial<NightnovaConfig>) => {
    guard(event)
    return coordinator.configure(patch && typeof patch === 'object' ? patch : {})
  })
  ipcMain.handle('nightnova:enqueue', (event, instruction: string) => {
    guard(event)
    return coordinator.enqueue(instruction)
  })
  ipcMain.handle('nightnova:remove', (event, id: string) => {
    guard(event)
    return coordinator.removeTask(id)
  })
  ipcMain.handle('nightnova:move', (event, id: string, delta: number) => {
    guard(event)
    return coordinator.moveTask(id, delta)
  })
  ipcMain.handle('nightnova:start', (event) => { guard(event); return coordinator.start() })
  ipcMain.handle('nightnova:stop', (event) => { guard(event); return coordinator.stop() })
  ipcMain.handle('nightnova:checkpoint', (event) => { guard(event); return coordinator.checkpoint() })
  ipcMain.handle('nightnova:restore', (event) => { guard(event); return coordinator.restore() })
  ipcMain.handle('nightnova:reset', (event) => { guard(event); return coordinator.reset() })
  ipcMain.handle('nightnova:git', (event) => { guard(event); return coordinator.refreshGit() })
  return coordinator
}
