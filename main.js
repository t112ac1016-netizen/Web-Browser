const { app, BrowserWindow, ipcMain, session, dialog, protocol } = require('electron');
const fs = require('fs');
const path = require('path');

const MAX_HISTORY_THUMBS = 280;
const THUMB_ORDER_FILENAME = '_thumb-order.json';
const APP_ICON_PATH = path.join(__dirname, 'src', 'browser-icon.png');

let historyThumbsDir = null;

app.setAppUserModelId('com.lmsgmaes.wb');

if (!app.isReady()) {
    protocol.registerSchemesAsPrivileged([
        {
            scheme: 'histthumb',
            privileges: {
                standard: true,
                secure: true,
                supportFetchAPI: true,
                corsEnabled: true,
                stream: true
            }
        }
    ]);
}

function getHistoryThumbsDir() {
    if (!historyThumbsDir) {
        historyThumbsDir = path.join(app.getPath('userData'), 'history-thumbnails');
    }
    return historyThumbsDir;
}

function readThumbOrder(dir) {
    const p = path.join(dir, THUMB_ORDER_FILENAME);
    try {
        const raw = fs.readFileSync(p, 'utf8');
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.filter(k => typeof k === 'string') : [];
    } catch (e) {
        return [];
    }
}

function writeThumbOrder(dir, order) {
    fs.writeFileSync(path.join(dir, THUMB_ORDER_FILENAME), JSON.stringify(order), 'utf8');
}

function saveHistoryThumbToDisk(key, buffer) {
    const dir = getHistoryThumbsDir();
    fs.mkdirSync(dir, { recursive: true });
    if (!/^[a-f0-9]{32}\.jpg$/i.test(key)) {
        throw new Error('invalid thumb key');
    }
    const full = path.join(dir, key);
    const normalizedDir = path.normalize(dir + path.sep);
    const normalizedFull = path.normalize(full);
    if (!normalizedFull.startsWith(normalizedDir)) {
        throw new Error('path escape');
    }
    fs.writeFileSync(full, buffer);

    let order = readThumbOrder(dir).filter(k => k !== key);
    order.push(key);
    while (order.length > MAX_HISTORY_THUMBS) {
        const oldKey = order.shift();
        try {
            fs.unlinkSync(path.join(dir, oldKey));
        } catch (err) {
            /* ignore */
        }
    }
    writeThumbOrder(dir, order);
}

let historyThumbProtocolRegistered = false;
let historyThumbIpcRegistered = false;

function registerHistoryThumbnailProtocol() {
    if (historyThumbProtocolRegistered) return;
    historyThumbProtocolRegistered = true;

    const dir = getHistoryThumbsDir();
    fs.mkdirSync(dir, { recursive: true });

    protocol.handle('histthumb', async request => {
        try {
            const u = new URL(request.url);
            const key = path.basename(decodeURIComponent(u.pathname));
            if (!/^[a-f0-9]{32}\.jpg$/i.test(key)) {
                return new Response(null, { status: 404 });
            }
            const full = path.join(dir, key);
            const normalizedDir = path.normalize(dir + path.sep);
            const normalizedFull = path.normalize(full);
            if (!normalizedFull.startsWith(normalizedDir)) {
                return new Response(null, { status: 403 });
            }
            const buf = await fs.promises.readFile(full);
            return new Response(buf, {
                headers: {
                    'Content-Type': 'image/jpeg',
                    'Cache-Control': 'public, max-age=604800'
                }
            });
        } catch (e) {
            return new Response(null, { status: 404 });
        }
    });
}

function registerHistoryThumbIpc() {
    if (historyThumbIpcRegistered) return;
    historyThumbIpcRegistered = true;

    ipcMain.handle('history-thumb-save', (event, payload) => {
        try {
            if (!payload || !payload.key) {
                return { ok: false };
            }
            let buf = payload.buffer;
            if (buf == null) {
                return { ok: false };
            }
            if (!Buffer.isBuffer(buf)) {
                buf = Buffer.from(buf);
            }
            if (buf.length === 0) {
                return { ok: false };
            }
            saveHistoryThumbToDisk(payload.key, buf);
            const url = `histthumb://local/${payload.key}`;
            return { ok: true, url };
        } catch (e) {
            console.error('history-thumb-save:', e);
            return { ok: false };
        }
    });

    ipcMain.handle('history-thumb-delete', (event, key) => {
        try {
            if (!key || typeof key !== 'string' || !/^[a-f0-9]{32}\.jpg$/i.test(key)) {
                return { ok: false };
            }
            const dir = getHistoryThumbsDir();
            const full = path.join(dir, key);
            const normalizedDir = path.normalize(dir + path.sep);
            const normalizedFull = path.normalize(full);
            if (!normalizedFull.startsWith(normalizedDir)) {
                return { ok: false };
            }
            try {
                fs.unlinkSync(full);
            } catch (err) {
                /* 檔案不存在仍更新清單 */
            }
            const order = readThumbOrder(dir).filter(k => k !== key);
            writeThumbOrder(dir, order);
            return { ok: true };
        } catch (e) {
            console.error('history-thumb-delete:', e);
            return { ok: false };
        }
    });
}

let mainWindow;
let downloadAskLocation = false;
let downloadIdCounter = 1;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 560,
    minWidth: 1000,
    minHeight: 560,

    // 隱藏 Windows 預設選單列
    autoHideMenuBar: true,

    icon: APP_ICON_PATH,

    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true
    }
  });

  // =========================================================
  // 移除 File / Edit / View / Window / Help
  // =========================================================

  //mainWindow.setMenu(null);
  mainWindow.setMenuBarVisibility(false);

  // =========================================================
  // 正式版禁止 DevTools
  // =========================================================

  if (app.isPackaged) {

    // 如果 DevTools 因任何原因被開啟，立即關閉
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow.webContents.closeDevTools();
    });

    // 阻擋常見 DevTools 快捷鍵
    mainWindow.webContents.on('before-input-event', (event, input) => {

      const key = input.key.toLowerCase();

      // F12
      if (key === 'f12') {
        event.preventDefault();
        return;
      }

      // Ctrl + Shift + I
      if (
        input.control &&
        input.shift &&
        key === 'i'
      ) {
        event.preventDefault();
        return;
      }

      // Ctrl + Shift + J
      if (
        input.control &&
        input.shift &&
        key === 'j'
      ) {
        event.preventDefault();
        return;
      }

      // Ctrl + Shift + C
      if (
        input.control &&
        input.shift &&
        key === 'c'
      ) {
        event.preventDefault();
        return;
      }
    });
  }

  // 載入應用程式
  mainWindow.loadFile('index.html');

  // 僅開發模式允許手動開 DevTools
  if (!app.isPackaged) {
    // mainWindow.webContents.openDevTools();
  }
}

// 當 Electron 準備就緒時，創建視窗
app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(APP_ICON_PATH);
  }

  registerHistoryThumbnailProtocol();
  registerHistoryThumbIpc();

  createWindow();

  // 確保在 macOS 上，點擊 dock 圖標可以重新創建視窗
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 關閉所有視窗時退出應用程式 (除 macOS 外)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});


let historyFilePath;

app.whenReady().then(() => {
    // 預設放在「下載」資料夾內
    historyFilePath = path.join(
        app.getPath('downloads'),
        'ai-mini-browser-history.ndjson'
    );

    // 下載事件監聽
    const defaultSession = session.defaultSession;
    if (defaultSession) {
        defaultSession.on('will-download', async (event, item, webContents) => {
            try {
                // 防止同一個下載項目重複彈出存檔視窗
                if (item.__saveDialogHandled) {
                    console.log('[will-download] save dialog already handled, skip duplicate for', item.getFilename());
                    return;
                }
                item.__saveDialogHandled = true;

                const id = downloadIdCounter++;
                const fileName = item.getFilename();
                // 對於 webview 觸發的下載，直接使用 mainWindow
                const win = mainWindow;

                console.log('[will-download] file:', fileName, 'askLocation:', downloadAskLocation, 'win exists:', !!win);

                // 設定儲存路徑
                if (downloadAskLocation && win && !win.isDestroyed()) {
                    console.log('[will-download] Showing save dialog...');
                    const result = await dialog.showSaveDialog(win, {
                        defaultPath: path.join(app.getPath('downloads'), fileName),
                        title: '儲存檔案'
                    });
                    console.log('[will-download] Dialog result:', result);
                    if (result.canceled || !result.filePath) {
                        item.cancel();
                        if (win && !win.isDestroyed()) {
                            win.webContents.send('download-updated', {
                                id,
                                fileName,
                                receivedBytes: 0,
                                totalBytes: 0,
                                state: 'cancelled'
                            });
                        }
                        return;
                    }
                    item.setSavePath(result.filePath);
                    console.log('[will-download] Save path set to:', result.filePath);
                } else {
                    const defaultPath = path.join(app.getPath('downloads'), fileName);
                    item.setSavePath(defaultPath);
                    console.log('[will-download] Using default path:', defaultPath);
                }

                // 初始狀態
                if (win && !win.isDestroyed()) {
                    win.webContents.send('download-updated', {
                        id,
                        fileName,
                        receivedBytes: 0,
                        totalBytes: item.getTotalBytes() || 0,
                        state: 'progressing'
                    });
                }

                item.on('updated', (e, state) => {
                    if (!win || win.isDestroyed()) return;
                    win.webContents.send('download-updated', {
                        id,
                        fileName,
                        receivedBytes: item.getReceivedBytes(),
                        totalBytes: item.getTotalBytes(),
                        state: state === 'interrupted' ? 'interrupted' : 'progressing'
                    });
                });

                item.on('done', (e, state) => {
                    if (!win || win.isDestroyed()) return;
                    let finalState = 'completed';
                    if (state === 'cancelled') finalState = 'cancelled';
                    else if (state === 'interrupted') finalState = 'interrupted';

                    win.webContents.send('download-updated', {
                        id,
                        fileName,
                        receivedBytes: item.getReceivedBytes(),
                        totalBytes: item.getTotalBytes(),
                        state: finalState
                    });
                });
            } catch (err) {
                console.error('處理下載事件時發生錯誤：', err);
            }
        });
    }

    // 其他 BrowserWindow 建立邏輯 ...
});

// 接收 renderer.js 傳來的歷史紀錄
ipcMain.on('history-append', (event, entry) => {
    try {
        if (!historyFilePath) {
            historyFilePath = path.join(
                app.getPath('downloads'),
                'ai-mini-browser-history.ndjson'
            );
        }
        const line = JSON.stringify(entry) + '\n';
        fs.appendFile(historyFilePath, line, (err) => {
            if (err) {
                console.error('寫入歷史紀錄失敗：', err);
            }
        });
    } catch (e) {
        console.error('history-append 處理錯誤：', e);
    }
});

// 下載前是否詢問儲存位置
ipcMain.on('set-download-ask-location', (event, value) => {
    downloadAskLocation = !!value;
    console.log('[set-download-ask-location]', downloadAskLocation);
});

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }

      mainWindow.focus();
    }
  });
}
