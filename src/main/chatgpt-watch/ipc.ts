import { ipcMain, type BrowserWindow } from 'electron'
import { ChatGptConversationWatch } from './service'
import type { ChatWatchConfig } from '../../shared/chatgpt-watch'

export function registerChatGptWatchIpc(
  getWindow: () => BrowserWindow | null
): ChatGptConversationWatch {
  const watch = new ChatGptConversationWatch(getWindow, (state) => {
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
  ipcMain.handle('chatwatch:configure', async (event, patch: Partial<ChatWatchConfig>) => {
    await access(event)
    return watch.configure(patch)
  })
  ipcMain.handle('chatwatch:start', async (event, webContentsId: number) => {
    await access(event)
    return watch.start(webContentsId)
  })
  ipcMain.handle('chatwatch:inspect', async (event, webContentsId: number) => {
    await access(event)
    return watch.inspect(webContentsId)
  })
  ipcMain.handle('chatwatch:pause', async (event) => {
    await access(event)
    return watch.pause()
  })
  ipcMain.handle('chatwatch:stop', async (event) => {
    await access(event)
    return watch.stop()
  })
  void watch.initialize()
  return watch
}
