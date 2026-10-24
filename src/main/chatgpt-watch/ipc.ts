import { ipcMain, type BrowserWindow } from 'electron'
import { ChatGptWatchHub } from './hub'
import type { ChatWatchConfig, ChatWatchRotation } from '../../shared/chatgpt-watch'

export function registerChatGptWatchIpc(
  getWindow: () => BrowserWindow | null
): ChatGptWatchHub {
  const watch = new ChatGptWatchHub(getWindow, (state) => {
    const win = getWindow()
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('chatwatch:state', state)
    }
  })
  const access = async (event: Electron.IpcMainInvokeEvent): Promise<void> => {
    const win = getWindow()
    if (!win || win.isDestroyed() || event.sender !== win.webContents) {
      throw new Error('ChatGPT 감독 IPC는 NightNova 자체 UI에서만 호출할 수 있습니다.')
    }
    await watch.initialize()
  }
  ipcMain.handle('chatwatch:state', async (event) => {
    await access(event)
    return watch.state()
  })
  ipcMain.handle('chatwatch:rotation', async (event, patch: Partial<ChatWatchRotation>) => {
    await access(event)
    return watch.configureRotation(patch)
  })
  ipcMain.handle('chatwatch:visible', async (event, id: number | null) => {
    await access(event)
    watch.setVisibleTab(id)
  })
  ipcMain.handle('chatwatch:start-many', async (event, ids: number[]) => {
    await access(event)
    return watch.startMany(ids)
  })
  ipcMain.handle('chatwatch:pause-all', async (event) => {
    await access(event)
    return watch.pauseAll()
  })
  ipcMain.handle('chatwatch:stop-all', async (event) => {
    await access(event)
    return watch.stopAll()
  })
  ipcMain.handle('chatwatch:configure', async (event, id: number, patch: Partial<ChatWatchConfig>) => {
    await access(event)
    return watch.configure(id, patch)
  })
  ipcMain.handle('chatwatch:start', async (event, webContentsId: number) => {
    await access(event)
    return watch.start(webContentsId)
  })
  ipcMain.handle('chatwatch:inspect', async (event, webContentsId: number) => {
    await access(event)
    return watch.inspect(webContentsId)
  })
  ipcMain.handle('chatwatch:pause', async (event, id: number) => {
    await access(event)
    return watch.pause(id)
  })
  ipcMain.handle('chatwatch:stop', async (event, id: number) => {
    await access(event)
    return watch.stop(id)
  })
  void watch.initialize()
  return watch
}
