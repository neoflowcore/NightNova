import { BrowserWindow, ipcMain, shell } from 'electron'
import { NightnovaCoordinator } from './coordinator'
import type { NightnovaConfig } from '../../shared/nightnova'

export function registerNightnovaIpc(getWindow: () => BrowserWindow | null): NightnovaCoordinator {
  const coordinator = new NightnovaCoordinator((snapshot) => {
    const win = getWindow()
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('nightnova:state', snapshot)
    }
  })

  // IPC is privileged: only the trusted Nightnova app renderer can send these
  // messages. Embedded webviews and remote pages cannot invoke them directly.
  const access = async (event: Electron.IpcMainInvokeEvent): Promise<void> => {
    const win = getWindow()
    if (!win || event.sender !== win.webContents) throw new Error('Nightnova IPC 권한 없음')
    await coordinator.initialize()
  }

  ipcMain.handle('nightnova:state', async (event) => {
    await access(event)
    return coordinator.state()
  })
  ipcMain.handle('nightnova:choose-workspace', async (event) => {
    await access(event)
    const win = getWindow()
    if (!win) throw new Error('앱 창이 닫혔습니다.')
    return coordinator.chooseWorkspace(win)
  })
  ipcMain.handle('nightnova:configure', async (event, patch: Partial<NightnovaConfig>) => {
    await access(event)
    return coordinator.configure(patch && typeof patch === 'object' ? patch : {})
  })
  ipcMain.handle('nightnova:enqueue', async (event, instruction: string, expectChanges = true) => {
    await access(event)
    return coordinator.enqueue(instruction, expectChanges)
  })
  ipcMain.handle('nightnova:enqueue-many', async (
    event, items: Array<{ instruction: string; expectChanges?: boolean }>
  ) => {
    await access(event)
    return coordinator.enqueueMany(items)
  })
  ipcMain.handle('nightnova:templates', async (event) => {
    await access(event)
    return coordinator.templates()
  })
  ipcMain.handle('nightnova:enqueue-template', async (event, id: string) => {
    await access(event)
    return coordinator.enqueueTemplate(id)
  })
  ipcMain.handle('nightnova:remove', async (event, id: string) => {
    await access(event)
    return coordinator.removeTask(id)
  })
  ipcMain.handle('nightnova:retry', async (event, id: string) => {
    await access(event)
    return coordinator.retryTask(id)
  })
  ipcMain.handle('nightnova:move', async (event, id: string, delta: number) => {
    await access(event)
    return coordinator.moveTask(id, delta)
  })
  ipcMain.handle('nightnova:start', async (event) => {
    await access(event)
    return coordinator.start()
  })
  ipcMain.handle('nightnova:stop', async (event) => {
    await access(event)
    return coordinator.stop()
  })
  ipcMain.handle('nightnova:checkpoint', async (event) => {
    await access(event)
    return coordinator.checkpoint()
  })
  ipcMain.handle('nightnova:restore', async (event) => {
    await access(event)
    return coordinator.restore()
  })
  ipcMain.handle('nightnova:reset', async (event) => {
    await access(event)
    return coordinator.reset()
  })
  ipcMain.handle('nightnova:git', async (event) => {
    await access(event)
    return coordinator.refreshGit()
  })
  ipcMain.handle('nightnova:doctor', async (event) => {
    await access(event)
    return coordinator.doctor()
  })
  ipcMain.handle('nightnova:handoff', async (event) => {
    await access(event)
    return coordinator.exportHandoff()
  })
  ipcMain.handle('nightnova:show-handoff', async (event) => {
    await access(event)
    const path = coordinator.state().handoffPath
    if (!path) throw new Error('먼저 인계서를 생성하세요.')
    shell.showItemInFolder(path)
    return true
  })
  // Initial hydration is also awaited by every IPC operation. Start it here
  // so an already-saved queue appears immediately after the first paint.
  void coordinator.initialize()
  return coordinator
}
