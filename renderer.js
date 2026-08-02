let ipcRenderer = null;
try {
    if (window.require) {
        const electron = window.require('electron');
        if (electron && electron.ipcRenderer) {
            ipcRenderer = electron.ipcRenderer;
        }
    }
} catch (e) {
    console.warn('ipcRenderer not available; history file writing disabled.', e);
}

document.addEventListener('DOMContentLoaded', () => {
    const addressInput = document.getElementById('address-input');
    const bookmarkButton = document.getElementById('bookmark-button');
    const bookmarkIcon = document.getElementById('bookmark-icon');
    const goButton = document.getElementById('go-button');
    const downloadsButton = document.getElementById('downloads-button');
    const navBack = document.getElementById('nav-back');
    const navForward = document.getElementById('nav-forward');
    const webview = document.getElementById('webview-main');
    const downloadsPanel = document.getElementById('downloads-panel');
    const downloadsPanelClose = document.getElementById('downloads-panel-close');
    const downloadsList = document.getElementById('downloads-list');
    const downloadsAskLocationToggle = document.getElementById('downloads-ask-location-toggle');
    const breadcrumbBarContainer = document.getElementById('breadcrumb-bar-container');
    const pageBreadcrumb = document.getElementById('page-breadcrumb');

    const tabsList = document.getElementById('tabs-list');
    const addTabButton = document.getElementById('add-tab');
    const toggleThumbnailViewButton = document.getElementById('toggle-thumbnail-view');

    const toggleSidebarButton = document.getElementById('toggle-sidebar');
    const toggleSidebarRightButton = document.getElementById('toggle-sidebar-right');
    const homeButton = document.getElementById('home-button');
    const reloadButton = document.getElementById('reload-button');
    const settingsButton = document.getElementById('settings-button');
    const personalCenterButton = document.getElementById('personal-center-button');
    const browserContent = document.getElementById('browser-content');
    const sidebar = document.getElementById('sidebar');
    const sidebarResizer = document.getElementById('sidebar-resizer');

    const sidebarModeTabsBtn = document.getElementById('sidebar-mode-tabs');
    const sidebarModeHistoryBtn = document.getElementById('sidebar-mode-history');
    const sidebarModeClipboardBtn = document.getElementById('sidebar-mode-clipboard');
    const historyList = document.getElementById('history-list');
    const clipboardList = document.getElementById('clipboard-list');

    // 上一頁 / 下一頁 預覽元素
    const navPreview = document.getElementById('nav-preview');
    const navPreviewImage = document.getElementById('nav-preview-image');
    const navPreviewTitle = document.getElementById('nav-preview-title');

    // 右键菜单相关元素
    const contextMenu = document.getElementById('context-menu');
    const contextMenuBack = document.getElementById('context-menu-back');
    const contextMenuCopy = document.getElementById('context-menu-copy');
    const contextMenuPaste = document.getElementById('context-menu-paste');
    const contextMenuSearch = document.getElementById('context-menu-search');
    const contextMenuIncognito = document.getElementById('context-menu-incognito');
    const webviewContainer = document.getElementById('webview-container');
    let contextMenuToggleLockUntil = 0;

    // -------- 分頁與歷史狀態（每個分頁獨立） --------
    let tabs = [];              // [{ id, title, url, history, historyIndex, lastHistoryUrl }]
    let activeTabId = null;
    let nextTabId = 1;

    // 全域歷史（所有分頁共同）
    let globalHistory = [];     // [{ url, title, tabId, timestamp }]

    // 控制 did-navigate 行為
    let suppressNextHistoryUpdate = false;
    let historyJumpInProgress = false;

    // 側邊欄模式：'tabs'、'history' 或 'clipboard'
    let sidebarMode = 'tabs';
    // 側邊欄是否是由滑鼠自動暫時打開（hover 開啟）
    let sidebarAutoOpened = false;
    
    // 分頁縮圖檢視模式：false = 列表模式, true = 縮圖模式
    let thumbnailViewMode = true;
    
    // 複製暫存（只在內存中，關閉瀏覽器後刪除）
    let clipboardHistory = []; // [{ type: 'text'|'url'|'image'|'video', content: string, url?: string, timestamp: Date }]

    // 下載列表（只在內存中）
    // [{ id, fileName, receivedBytes, totalBytes, state: 'progressing'|'completed'|'cancelled'|'interrupted' }]
    let downloads = [];
    let downloadAskLocation = false;

    // 縮圖快取：key = `${tabId}::${url}` -> dataURL
    let historyThumbnails = {};

    // 釘選分頁：儲存被釘選的網址（跨重啟）
    // 僅儲存網址字串陣列，例如 ['https://example.com', ...]
    let pinnedTabUrls = [];

    // --- global history persistence (localStorage) ---
    const GLOBAL_HISTORY_LS_KEY = 'global-history';
    const GLOBAL_HISTORY_MAX_LOCAL = 2000; // keep latest N entries in localStorage

    function saveGlobalHistoryToLocalStorage() {
        try {
            if (!Array.isArray(globalHistory)) return;
            const toSave = globalHistory.slice(-GLOBAL_HISTORY_MAX_LOCAL);
            localStorage.setItem(GLOBAL_HISTORY_LS_KEY, JSON.stringify(toSave));
        } catch (e) {
            console.warn('saveGlobalHistoryToLocalStorage failed', e);
        }
    }

    function loadGlobalHistoryFromLocalStorage() {
        try {
            const raw = localStorage.getItem(GLOBAL_HISTORY_LS_KEY);
            if (!raw) return;
            const arr = JSON.parse(raw);
            if (!Array.isArray(arr)) return;
            globalHistory = arr.map(e => ({
                url: e.url,
                title: e.title || e.url || '',
                favicon: e.favicon || null,
                tabId: (typeof e.tabId !== 'undefined') ? e.tabId : null,
                timestamp: e.timestamp || new Date().toISOString(),
                thumbnail: e.thumbnail || null
            }));
        } catch (e) {
            console.warn('loadGlobalHistoryFromLocalStorage failed', e);
        }
    }

    // 檢查是否在首頁
    function isHomePage(url) {
        if (!url) return false;
        // 檢查各種可能的首頁 URL 格式
        const normalizedUrl = url.toLowerCase();
        return normalizedUrl === './src/home.html' || 
               normalizedUrl.endsWith('/src/home.html') || 
               normalizedUrl.endsWith('\\src\\home.html') ||
               normalizedUrl.includes('home.html') && normalizedUrl.includes('src');
    }

    function isSettingsPage(url) {
        if (!url) return false;
        const normalizedUrl = url.toLowerCase();
        return normalizedUrl === './src/settings.html' ||
               normalizedUrl.endsWith('/src/settings.html') ||
               normalizedUrl.endsWith('\\src\\settings.html') ||
               (normalizedUrl.includes('settings.html') && normalizedUrl.includes('src'));
    }

    function isPersonalCenterPage(url) {
        if (!url) return false;
        return url.toLowerCase().includes('personal-center.html');
    }

    function getConfiguredHomeUrl() {
        const defaultHomeUrl = './src/home.html';
        const raw = localStorage.getItem('startup-home-url');
        if (!raw) return defaultHomeUrl;
        const url = raw.trim();
        if (!url) return defaultHomeUrl;
        if (
            url.startsWith('http://') ||
            url.startsWith('https://') ||
            url.startsWith('./') ||
            url.startsWith('file://')
        ) {
            return url;
        }
        return `https://${url}`;
    }

    // 從主進程接收下載進度更新（此處 downloads / renderDownloads / showDownloadsPanel 已宣告）
    if (ipcRenderer) {
        ipcRenderer.on('download-updated', (event, payload) => {
            if (!payload || !payload.id) return;
            console.log('download-updated payload:', payload);
            const idx = downloads.findIndex(d => d.id === payload.id);
            const info = {
                id: payload.id,
                fileName: payload.fileName || '(未命名檔案)',
                receivedBytes: payload.receivedBytes || 0,
                totalBytes: payload.totalBytes || 0,
                state: payload.state || 'progressing'
            };
            if (idx >= 0) {
                downloads[idx] = info;
            } else {
                downloads.push(info);
            }
            renderDownloads();
            // 收到任何下載事件時，自動打開下載面板，方便查看進度
            showDownloadsPanel();
        });
    }

    // -------- 下載相關 --------
    function renderDownloads() {
        if (!downloadsList) return;
        downloadsList.innerHTML = '';
        downloads.forEach(item => {
            const li = document.createElement('li');
            li.className = 'download-item';

            const nameDiv = document.createElement('div');
            nameDiv.className = 'download-item-name';
            nameDiv.textContent = item.fileName || '(未命名檔案)';

            // 創建進度條元素
            const progressBar = document.createElement('progress');
            progressBar.className = 'download-item-progress-bar';
            let percent = 0;
            if (item.totalBytes > 0 && item.receivedBytes >= 0) {
                percent = Math.min(100, Math.floor((item.receivedBytes / item.totalBytes) * 100));
                progressBar.max = 100;
                progressBar.value = percent;
            } else {
                progressBar.max = 100;
                progressBar.value = 0;
            }
            // 如果已完成、已取消或已中斷，隱藏進度條
            if (item.state === 'completed' || item.state === 'cancelled' || item.state === 'interrupted') {
                progressBar.style.display = 'none';
            }

            const progressDiv = document.createElement('div');
            progressDiv.className = 'download-item-progress';
            let progressText = '';
            if (item.totalBytes > 0 && item.receivedBytes >= 0) {
                progressText = `${percent}% (${item.receivedBytes}/${item.totalBytes} bytes)`;
            } else if (item.receivedBytes > 0) {
                progressText = `${item.receivedBytes} bytes`;
            }
            if (item.state === 'completed') {
                progressText = progressText ? progressText + ' - 已完成' : '已完成';
            } else if (item.state === 'cancelled') {
                progressText = '已取消';
            } else if (item.state === 'interrupted') {
                progressText = '已中斷';
            } else if (!progressText) {
                progressText = '準備中...';
            }
            progressDiv.textContent = progressText;

            li.appendChild(nameDiv);
            li.appendChild(progressBar);
            li.appendChild(progressDiv);
            downloadsList.appendChild(li);
        });
    }

    function showDownloadsPanel() {
        if (!downloadsPanel) return;
        downloadsPanel.classList.add('visible');
        updateToolButtonsState();
    }

    function hideDownloadsPanel() {
        if (!downloadsPanel) return;
        downloadsPanel.classList.remove('visible');
        updateToolButtonsState();
    }

    function updateToolButtonsState() {
        const tab = getActiveTab();
        if (downloadsButton) {
            downloadsButton.classList.toggle('active', !!(downloadsPanel && downloadsPanel.classList.contains('visible')));
        }
        if (settingsButton) {
            settingsButton.classList.toggle('active', !!(tab && isSettingsPage(tab.url)));
        }
        if (personalCenterButton) {
            personalCenterButton.classList.toggle('active', !!(tab && isPersonalCenterPage(tab.url)));
        }
    }

    function getBookmarkUrlFromAddressInput() {
        if (!addressInput) return '';
        const raw = addressInput.value.trim();
        if (!raw || raw === 'about:blank' || raw.startsWith('javascript:')) return '';
        if (/\s/.test(raw)) return '';

        const hasSupportedScheme = raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('file://');
        const hasLocalPath = raw.startsWith('./');
        const hasDomain = /^[^/:]+\.[^/:]+/.test(raw);
        const hasLocalhost = /^localhost(?::\d+)?(?:\/|$)/i.test(raw);
        const hasIPv4 = /^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:\/|$)/.test(raw);
        if (!hasSupportedScheme && !hasLocalPath && !hasDomain && !hasLocalhost && !hasIPv4) return '';

        let url = raw;
        if (
            !url.startsWith('http://') &&
            !url.startsWith('https://') &&
            !url.startsWith('./') &&
            !url.startsWith('file://')
        ) {
            url = 'http://' + url;
        }

        if (isHomePage(url) || isSettingsPage(url) || isPersonalCenterPage(url)) return '';
        return url;
    }

    function updateBookmarkButtonState() {
        if (!bookmarkButton || !bookmarkIcon) return;
        const url = getBookmarkUrlFromAddressInput();
        const visible = !!url;
        const bookmarked = visible && isUrlPinned(url);

        bookmarkButton.classList.toggle('visible', visible);
        bookmarkButton.classList.toggle('bookmarked', bookmarked);
        bookmarkButton.setAttribute('aria-pressed', bookmarked ? 'true' : 'false');
        bookmarkButton.title = bookmarked ? '移除書籤' : '加入書籤';
        bookmarkIcon.textContent = bookmarked ? 'bookmark_check' : 'bookmark';
    }

    function syncTabPinnedState(tab) {
        if (!tab || !tab.url) return;
        tab.pinned = isUrlPinned(tab.url);
    }

    function syncPinnedStateForUrl(url) {
        if (!url) return;
        tabs.forEach(tab => {
            if (tab.url === url) {
                syncTabPinnedState(tab);
            }
        });
    }

    function closeActiveToolPage() {
        const tab = getActiveTab();
        if (!tab || (!isSettingsPage(tab.url) && !isPersonalCenterPage(tab.url))) return;
        if (canGoBackInActiveTab()) {
            goBackInActiveTab();
        } else {
            openUrlFromUI('./src/home.html', { overrideTitle: '新分頁' });
        }
    }

    function isActiveToolPageOpen(checkPage) {
        const tab = getActiveTab();
        return !!(tab && checkPage(tab.url));
    }

    function openToolPage(url, overrideTitle) {
        hideDownloadsPanel();
        const tab = getActiveTab();
        if (tab && (isSettingsPage(tab.url) || isPersonalCenterPage(tab.url))) {
            if (tab.history && tab.historyIndex >= 0) {
                tab.history[tab.historyIndex] = url;
            }
            navigateTo(url, { addToHistory: false, overrideTitle });
            return;
        }
        openUrlFromUI(url, { overrideTitle });
    }

    // 更新地址列顯示
    function updateAddressInput() {
        const tab = getActiveTab();
        updateToolButtonsState();
        if (!tab || !tab.url) {
            addressInput.value = '';
            addressInput.placeholder = '輸入網址或 AI 指令';
            updateBookmarkButtonState();
            renderPageBreadcrumb();
            return;
        }

        if (isHomePage(tab.url)) {
            addressInput.value = '';
            addressInput.placeholder = '輸入網址或 AI 指令';
        } else {
            addressInput.value = tab.url;
            addressInput.placeholder = '輸入網址或 AI 指令';
        }
        updateBookmarkButtonState();
        renderPageBreadcrumb();
    }

    function getActiveTab() {
        return tabs.find(t => t.id === activeTabId) || null;
    }

    function canGoBackInActiveTab() {
        const tab = getActiveTab();
        return !!(tab && tab.history && tab.historyIndex > 0);
    }

    function canGoForwardInActiveTab() {
        const tab = getActiveTab();
        return !!(tab && tab.history && tab.historyIndex < tab.history.length - 1);
    }

    function updateNavButtons() {
        navBack.disabled = !canGoBackInActiveTab();
        navForward.disabled = !canGoForwardInActiveTab();
    }

    // -------- 階層位址欄（breadcrumb） --------
    function layoutBreadcrumbBar() {
        if (!breadcrumbBarContainer || !pageBreadcrumb || !addressInput) return;

        // 讓階層位址欄的可視寬度與 address-input 一致（包含 Go/右側按鈕不在內）
        const addrRect = addressInput.getBoundingClientRect();
        const containerRect = breadcrumbBarContainer.getBoundingClientRect();
        const left = Math.max(0, addrRect.left - containerRect.left);
        pageBreadcrumb.style.marginLeft = `${left}px`;
        pageBreadcrumb.style.width = `${Math.max(0, addrRect.width)}px`;
    }

    function getHistoryEntryTitle(tab, url) {
        if (!tab || !url) return url || '';

        // 優先從全域歷史中尋找對應分頁與網址的標題（由新到舊）
        for (let i = globalHistory.length - 1; i >= 0; i--) {
            const entry = globalHistory[i];
            if (entry.tabId === tab.id && entry.url === url && entry.title) {
                return entry.title;
            }
        }

        // 目前頁面的話，使用分頁標題
        if (tab.url === url && tab.title) {
            return tab.title;
        }

        try {
            const u = new URL(url);
            return u.hostname || url;
        } catch (e) {
            return url;
        }
    }

    function ensureBreadcrumbModel(tab) {
        if (!tab) return;
        if (!tab.breadcrumbButtons) {
            tab.breadcrumbButtons = [];
            tab.breadcrumbActiveIndex = -1;
        }

        // 若還沒初始化，但已有 history，先用「到目前為止的歷史」建一份按鈕
        if (tab.breadcrumbButtons.length === 0 && tab.history && tab.history.length > 0 && tab.historyIndex >= 0) {
            const slice = tab.history
                .slice(0, tab.historyIndex + 1)
                .filter(u => !isHomePage(u) && !isSettingsPage(u) && !isPersonalCenterPage(u)); // 忽略首頁/設定/個人中心
            tab.breadcrumbButtons = slice.map(u => ({
                url: u,
                title: getHistoryEntryTitle(tab, u)
            }));
            tab.breadcrumbActiveIndex = tab.breadcrumbButtons.length - 1;
        }
    }

    function updateBreadcrumbOnNavigation(url, mode) {
        const tab = getActiveTab();
        if (!tab) return;
        ensureBreadcrumbModel(tab);
        if (!url || isHomePage(url) || isSettingsPage(url) || isPersonalCenterPage(url)) return; // 忽略首頁/設定/個人中心

        // mode: 'new'（進入新頁面）|'jump'（返回/前進/其它跳轉）
        if (mode === 'new') {
            tab.breadcrumbButtons.push({
                url,
                title: getHistoryEntryTitle(tab, url)
            });
            tab.breadcrumbActiveIndex = tab.breadcrumbButtons.length - 1;
            return;
        }

        // jump：嘗試對齊到已存在的按鈕；找不到則補一顆
        let found = -1;
        for (let i = tab.breadcrumbButtons.length - 1; i >= 0; i--) {
            if (tab.breadcrumbButtons[i].url === url) {
                found = i;
                break;
            }
        }
        if (found === -1) {
            tab.breadcrumbButtons.push({
                url,
                title: getHistoryEntryTitle(tab, url)
            });
            tab.breadcrumbActiveIndex = tab.breadcrumbButtons.length - 1;
        } else {
            tab.breadcrumbActiveIndex = found;
        }
    }

    function renderPageBreadcrumb() {
        if (!breadcrumbBarContainer || !pageBreadcrumb) return;
        const tab = getActiveTab();
        if (!tab) {
            breadcrumbBarContainer.classList.remove('visible');
            pageBreadcrumb.innerHTML = '';
            return;
        }

        // 確保模型存在，並且移除任何指向首頁的按鈕（以防舊資料殘留）
        ensureBreadcrumbModel(tab);
        if (tab.breadcrumbButtons) {
            tab.breadcrumbButtons = tab.breadcrumbButtons.filter(item =>
                !isHomePage(item.url) && !isSettingsPage(item.url) && !isPersonalCenterPage(item.url));
            if (tab.breadcrumbButtons.length === 0) {
                tab.breadcrumbActiveIndex = -1;
            } else if (tab.breadcrumbActiveIndex >= tab.breadcrumbButtons.length) {
                tab.breadcrumbActiveIndex = tab.breadcrumbButtons.length - 1;
            }
        }

        const hasHistory = !!(tab.history && tab.history.length > 1);
        const canOperate = canGoBackInActiveTab() || canGoForwardInActiveTab();
        if (!hasHistory || !canOperate || !tab.breadcrumbButtons || tab.breadcrumbButtons.length === 0) {
            breadcrumbBarContainer.classList.remove('visible');
            pageBreadcrumb.innerHTML = '';
            return;
        }

        breadcrumbBarContainer.classList.add('visible');
        pageBreadcrumb.innerHTML = '';

        tab.breadcrumbButtons.forEach((item, index) => {
            const btn = document.createElement('button');
            const isActive = index === tab.breadcrumbActiveIndex;
            btn.className = 'breadcrumb-item' + (isActive ? ' active' : '');

            const title = item.title || getHistoryEntryTitle(tab, item.url);
            btn.textContent = title || item.url;
            btn.title = title ? `${title}\n${item.url}` : item.url;

            btn.addEventListener('click', () => {
                const currentTab = getActiveTab();
                if (!currentTab) return;

                const targetUrl = item.url;
                if (!targetUrl) return;

                // 點到目前頁面不動作
                if (currentTab.url === targetUrl) return;

                // 需求：返回舊頁面後，舊頁面按鈕以後的新頁面按鈕刪除（只刪除按鈕，不刪除瀏覽記錄）
                ensureBreadcrumbModel(currentTab);
                currentTab.breadcrumbButtons = currentTab.breadcrumbButtons.slice(0, index + 1);
                currentTab.breadcrumbActiveIndex = index;

                // 同步到 historyIndex（不 slice history）
                if (currentTab.history && currentTab.history.length > 0) {
                    let hIndex = -1;
                    // 優先從目前 index 往回找（更符合「返回舊頁面」）
                    for (let i = currentTab.historyIndex; i >= 0; i--) {
                        if (currentTab.history[i] === targetUrl) {
                            hIndex = i;
                            break;
                        }
                    }
                    // 找不到再往前找
                    if (hIndex === -1) {
                        for (let i = 0; i < currentTab.history.length; i++) {
                            if (currentTab.history[i] === targetUrl) {
                                hIndex = i;
                                break;
                            }
                        }
                    }
                    if (hIndex !== -1) {
                        currentTab.historyIndex = hIndex;
                    }
                }

                currentTab.url = targetUrl;
                currentTab.lastHistoryUrl = targetUrl;

                historyJumpInProgress = true;
                webview.src = targetUrl;
                renderTabs();
                updateNavButtons();
                updateAddressInput();
            });

            pageBreadcrumb.appendChild(btn);
        });

        // 每次渲染後重新對齊寬度
        layoutBreadcrumbBar();
    }

    // 初始化對齊，並在視窗尺寸改變時重新對齊
    layoutBreadcrumbBar();
    window.addEventListener('resize', () => {
        layoutBreadcrumbBar();
    });

    // 滾輪水平滾動（避免按鈕超出後無法操作）
    if (pageBreadcrumb) {
        pageBreadcrumb.addEventListener('wheel', (e) => {
            // 允許觸控板水平滾動（deltaX）與一般滑鼠滾輪（deltaY）轉成左右滾動
            const delta = (Math.abs(e.deltaX) > Math.abs(e.deltaY)) ? e.deltaX : e.deltaY;
            if (delta === 0) return;
            pageBreadcrumb.scrollLeft += delta;
            e.preventDefault();
        }, { passive: false });
    }

    // -------- 上一頁 / 下一頁 頁面預覽 --------
    function makeThumbKey(tabId, url) {
        return `${tabId}::${url}`;
    }

    /** 縮圖可為 histthumb:// URL（磁碟 JPEG）或舊版 data URL */
    function attachThumbnailToGlobalHistory(tab, thumbSrc) {
        if (!tab || !tab.url || !thumbSrc) return;
        for (let i = globalHistory.length - 1; i >= 0; i--) {
            const e = globalHistory[i];
            if (e.url === tab.url && e.tabId === tab.id) {
                e.thumbnail = thumbSrc;
                try { saveGlobalHistoryToLocalStorage(); } catch (err) { /* ignore */ }
                return;
            }
        }
        for (let i = globalHistory.length - 1; i >= 0; i--) {
            if (globalHistory[i].url === tab.url) {
                globalHistory[i].thumbnail = thumbSrc;
                try { saveGlobalHistoryToLocalStorage(); } catch (err) { /* ignore */ }
                return;
            }
        }
    }

    const HISTORY_THUMB_MAX_WIDTH = 320;
    const HISTORY_THUMB_JPEG_QUALITY = 72;

    async function captureCurrentPageThumbnail() {
        if (!webview) return;
        const tab = getActiveTab();
        if (!tab || !tab.url) return;
        if (isPersonalCenterPage(tab.url)) return;
        try {
            const image = await webview.capturePage();
            if (!image) return;

            const size = image.getSize();
            const w = size.width || 1;
            const h = size.height || 1;
            let outImage = image;
            if (w > HISTORY_THUMB_MAX_WIDTH) {
                const nh = Math.max(1, Math.round(h * (HISTORY_THUMB_MAX_WIDTH / w)));
                outImage = image.resize({ width: HISTORY_THUMB_MAX_WIDTH, height: nh });
            }

            const jpegBuffer = outImage.toJPEG(HISTORY_THUMB_JPEG_QUALITY);
            if (!jpegBuffer || jpegBuffer.length === 0) return;

            let ts = '';
            for (let i = globalHistory.length - 1; i >= 0; i--) {
                const e = globalHistory[i];
                if (e.url === tab.url && e.tabId === tab.id) {
                    ts = e.timestamp;
                    break;
                }
            }
            if (!ts) {
                ts = new Date().toISOString();
            }

            let thumbSrc = null;
            try {
                const crypto = window.require('crypto');
                const key = crypto.createHash('sha256').update(`${tab.url}\n${ts}\n${tab.id}`).digest('hex').slice(0, 32) + '.jpg';

                if (ipcRenderer && typeof ipcRenderer.invoke === 'function') {
                    const result = await ipcRenderer.invoke('history-thumb-save', { key, buffer: jpegBuffer });
                    if (result && result.ok && result.url) {
                        thumbSrc = result.url;
                    }
                }
            } catch (err) {
                console.warn('history-thumb-save 略過:', err);
            }

            if (!thumbSrc) {
                thumbSrc = `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;
            }

            historyThumbnails[makeThumbKey(tab.id, tab.url)] = thumbSrc;
            attachThumbnailToGlobalHistory(tab, thumbSrc);
            if (thumbnailViewMode) {
                renderTabs();
            }
        } catch (e) {
            console.warn('capturePage 失敗:', e);
        }
    }

    function hideNavPreview() {
        if (navPreview) {
            navPreview.classList.remove('visible');
        }
    }

    function showNavPreview(type) {
        if (!navPreview || !navPreviewTitle) return;
        const tab = getActiveTab();
        if (!tab || !tab.history || tab.history.length === 0) {
            hideNavPreview();
            return;
        }

        let targetIndex = tab.historyIndex;
        if (type === 'back') {
            if (!canGoBackInActiveTab()) {
                hideNavPreview();
                return;
            }
            targetIndex = tab.historyIndex - 1;
        } else if (type === 'forward') {
            if (!canGoForwardInActiveTab()) {
                hideNavPreview();
                return;
            }
            targetIndex = tab.historyIndex + 1;
        } else {
            hideNavPreview();
            return;
        }

        if (targetIndex < 0 || targetIndex >= tab.history.length) {
            hideNavPreview();
            return;
        }

        const url = tab.history[targetIndex];
        if (!url) {
            hideNavPreview();
            return;
        }

        const title = getHistoryEntryTitle(tab, url);
        navPreviewTitle.textContent = title || url;

        if (navPreviewImage) {
            const key = makeThumbKey(tab.id, url);
            const thumb = historyThumbnails[key];
            if (thumb) {
                navPreviewImage.src = thumb;
                navPreviewImage.style.display = '';
            } else {
                // 沒有縮圖時顯示灰色背景
                navPreviewImage.removeAttribute('src');
                navPreviewImage.style.display = '';
            }
        }

        // 定位在對應按鈕下方
        const btn = (type === 'back') ? navBack : navForward;
        if (!btn) return;
        const rect = btn.getBoundingClientRect();
        const previewWidth = 220;
        let left = rect.left + rect.width / 2 - previewWidth / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - previewWidth - 8));
        const top = rect.bottom + 6;

        navPreview.style.left = `${left}px`;
        navPreview.style.top = `${top}px`;
        navPreview.style.width = `${previewWidth}px`;
        navPreview.classList.add('visible');
    }

    // -------- 側邊欄呈現切換 --------
    function renderSidebarView() {
        if (sidebarMode === 'tabs') {
            tabsList.style.display = '';
            historyList.style.display = 'none';
            clipboardList.style.display = 'none';
            addTabButton.style.display = '';
            if (toggleThumbnailViewButton) toggleThumbnailViewButton.style.display = '';
            sidebarModeTabsBtn.classList.add('active');
            sidebarModeHistoryBtn.classList.remove('active');
            if (sidebarModeClipboardBtn) sidebarModeClipboardBtn.classList.remove('active');
        } else if (sidebarMode === 'history') {
            tabsList.style.display = 'none';
            historyList.style.display = 'block';
            clipboardList.style.display = 'none';
            addTabButton.style.display = 'none';
            if (toggleThumbnailViewButton) toggleThumbnailViewButton.style.display = 'none';
            sidebarModeTabsBtn.classList.remove('active');
            sidebarModeHistoryBtn.classList.add('active');
            if (sidebarModeClipboardBtn) sidebarModeClipboardBtn.classList.remove('active');
        } else if (sidebarMode === 'clipboard') {
            tabsList.style.display = 'none';
            historyList.style.display = 'none';
            clipboardList.style.display = 'block';
            addTabButton.style.display = 'none';
            if (toggleThumbnailViewButton) toggleThumbnailViewButton.style.display = 'none';
            sidebarModeTabsBtn.classList.remove('active');
            sidebarModeHistoryBtn.classList.remove('active');
            if (sidebarModeClipboardBtn) sidebarModeClipboardBtn.classList.add('active');
        }
    }

    // -------- 事件綁定：下載按鈕 / 下載面板 --------
    if (downloadsButton) {
        downloadsButton.addEventListener('click', () => {
            if (downloadsPanel && downloadsPanel.classList.contains('visible')) {
                hideDownloadsPanel();
            } else {
                closeActiveToolPage();
                showDownloadsPanel();
            }
        });
    }

    if (downloadsPanelClose) {
        downloadsPanelClose.addEventListener('click', () => {
            hideDownloadsPanel();
        });
    }

    if (downloadsAskLocationToggle) {
        const stored = localStorage.getItem('downloadAskLocation');
        if (stored === 'true') {
            downloadAskLocation = true;
            downloadsAskLocationToggle.checked = true;
        }

        downloadsAskLocationToggle.addEventListener('change', () => {
            downloadAskLocation = downloadsAskLocationToggle.checked;
            localStorage.setItem('downloadAskLocation', downloadAskLocation ? 'true' : 'false');
            if (ipcRenderer) {
                ipcRenderer.send('set-download-ask-location', downloadAskLocation);
            }
        });

        // 初次同步當前值到主進程
        if (ipcRenderer) {
            ipcRenderer.send('set-download-ask-location', downloadAskLocation);
        }
    }

    function renderTabs() {
        tabsList.innerHTML = '';
        
        // 根据缩图模式切换 CSS 类
        if (thumbnailViewMode) {
            tabsList.classList.add('thumbnail-mode');
        } else {
            tabsList.classList.remove('thumbnail-mode');
        }

        tabs.forEach(tab => {
            const li = document.createElement('li');
            li.className = 'tab-item' + (tab.id === activeTabId ? ' active' : '');
            li.dataset.tabId = tab.id;
            li.draggable = true; // 启用拖拽

            if (thumbnailViewMode) {
                // 缩图模式：显示缩图、标题和关闭按钮
                const headerDiv = document.createElement('div');
                headerDiv.className = 'tab-item-header';
                headerDiv.style.display = 'flex';
                headerDiv.style.alignItems = 'center';
                headerDiv.style.gap = '4px';

                const pinBtn = document.createElement('button');
                pinBtn.className = 'pin-tab';
                const pinIcon = document.createElement('span');
                if (tab.pinned) {
                    pinIcon.className = 'material-symbols-sharp';
                    pinIcon.textContent = 'keep_off';
                } else {
                    pinIcon.className = 'material-symbols-outlined';
                    pinIcon.textContent = 'keep';
                }
                pinBtn.appendChild(pinIcon);
                pinBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleTabPinned(tab.id);
                });
                
                const closeBtn = document.createElement('button');
                closeBtn.className = 'close-tab';
                closeBtn.textContent = '×';
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                });
                headerDiv.appendChild(pinBtn);
                headerDiv.appendChild(closeBtn);

                const thumbnailImg = document.createElement('img');
                thumbnailImg.className = 'tab-thumbnail';
                const thumbKey = makeThumbKey(tab.id, tab.url);
                if (historyThumbnails[thumbKey]) {
                    thumbnailImg.src = historyThumbnails[thumbKey];
                } else {
                    // 如果没有缩图，显示灰色占位符
                    thumbnailImg.style.backgroundColor = '#e0e0e0';
                    thumbnailImg.style.display = 'flex';
                    thumbnailImg.style.alignItems = 'center';
                    thumbnailImg.style.justifyContent = 'center';
                    thumbnailImg.style.color = '#999';
                    thumbnailImg.alt = '無縮圖';
                }
                thumbnailImg.onerror = function() {
                    this.style.backgroundColor = '#e0e0e0';
                    this.style.display = 'flex';
                    this.style.alignItems = 'center';
                    this.style.justifyContent = 'center';
                };

                const titleSpan = document.createElement('span');
                titleSpan.className = 'tab-title';
                titleSpan.textContent = tab.title || tab.url || '新分頁';

                li.appendChild(headerDiv);
                li.appendChild(thumbnailImg);
                li.appendChild(titleSpan);
            } else {
                // 列表模式：显示 favicon、标题、釘選按鈕和关闭按钮
                const faviconImg = document.createElement('img');
                faviconImg.className = 'tab-favicon';
                if (tab.favicon) {
                    faviconImg.src = tab.favicon;
                    faviconImg.onerror = function() {
                        this.style.display = 'none';
                    };
                } else {
                    faviconImg.style.display = 'none';
                }

                // 如果是首頁，使用 Material Symbols 的 home 圖示代替 favicon
                let homeIcon = null;
                try {
                    if (isHomePage(tab.url)) {
                        homeIcon = document.createElement('span');
                        homeIcon.className = 'material-symbols-outlined tab-favicon-icon';
                        homeIcon.textContent = 'home';
                    }
                } catch (e) {
                    // 忽略判斷錯誤
                }

                const titleSpan = document.createElement('span');
                titleSpan.className = 'tab-title';
                titleSpan.textContent = tab.title || tab.url || '新分頁';

                const pinBtn = document.createElement('button');
                pinBtn.className = 'pin-tab';
                const pinIcon = document.createElement('span');
                if (tab.pinned) {
                    pinIcon.className = 'material-symbols-sharp';
                    pinIcon.textContent = 'keep_off';
                } else {
                    pinIcon.className = 'material-symbols-outlined';
                    pinIcon.textContent = 'keep';
                }
                pinBtn.appendChild(pinIcon);
                pinBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleTabPinned(tab.id);
                });

                const closeBtn = document.createElement('button');
                closeBtn.className = 'close-tab';
                closeBtn.textContent = '×';

                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                });

                // 若為首頁則加入 home 圖示；否則加入 favicon（如果有）
                if (homeIcon) {
                    li.appendChild(homeIcon);
                } else {
                    li.appendChild(faviconImg);
                }
                li.appendChild(titleSpan);
                li.appendChild(pinBtn);
                li.appendChild(closeBtn);
            }

            li.addEventListener('click', () => {
                activateTab(tab.id);
            });

            // 拖拽开始事件
            li.addEventListener('dragstart', (e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', tab.id.toString());
                li.style.opacity = '0.5';
                draggedTabId = tab.id; // 记录被拖拽的 tab ID
            });

            // 拖拽结束事件
            li.addEventListener('dragend', (e) => {
                li.style.opacity = '';
                // 清除所有高亮
                const allItems = tabsList.querySelectorAll('.tab-item');
                allItems.forEach(item => {
                    item.style.backgroundColor = '';
                });
            });

            tabsList.appendChild(li);
        });
    }

    function formatTime(iso) {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        return d.toLocaleString();
    }

    function historyEntryKeyMatch(a, b) {
        if (!a || !b) return false;
        if (a.url !== b.url || a.timestamp !== b.timestamp) return false;
        return a.tabId === b.tabId || (a.tabId == null && b.tabId == null);
    }

    async function removeGlobalHistoryEntry(entry) {
        const index = globalHistory.findIndex(item => historyEntryKeyMatch(item, entry));
        if (index === -1) return false;
        const removed = globalHistory[index];
        globalHistory.splice(index, 1);

        const thumb = removed.thumbnail;
        if (thumb && typeof thumb === 'string' && thumb.startsWith('histthumb://')) {
            try {
                const pathMod = window.require('path');
                const key = pathMod.basename(decodeURIComponent(new URL(thumb).pathname));
                if (ipcRenderer && typeof ipcRenderer.invoke === 'function') {
                    await ipcRenderer.invoke('history-thumb-delete', key);
                }
            } catch (err) {
                console.warn('刪除縮圖檔失敗:', err);
            }
        }

        if (removed.tabId != null && removed.url) {
            delete historyThumbnails[makeThumbKey(removed.tabId, removed.url)];
        }

        if (ipcRenderer) {
            ipcRenderer.send('history-delete', removed);
        }
        try { saveGlobalHistoryToLocalStorage(); } catch (err) { /* ignore */ }
        if (sidebarMode === 'history') {
            renderHistory();
        }
        if (thumbnailViewMode) {
            renderTabs();
        }
        try {
            const wu = webview && typeof webview.getURL === 'function' ? webview.getURL() : '';
            if (wu && wu.toLowerCase().includes('personal-center.html')) {
                injectPersonalCenterHistory();
            }
        } catch (err) {
            /* ignore */
        }
        return true;
    }

    function renderHistory() {
        historyList.innerHTML = '';

        // 最新的放上面
        const items = globalHistory.slice().reverse();

        items.forEach(entry => {
            const li = document.createElement('li');
            li.className = 'history-item';

            // 创建容器用于 favicon 和标题
            const contentDiv = document.createElement('div');
            contentDiv.className = 'history-content';

            // Favicon
            const faviconImg = document.createElement('img');
            faviconImg.className = 'history-favicon';
            if (entry.favicon) {
                faviconImg.src = entry.favicon;
                faviconImg.onerror = function() {
                    // 如果 favicon 加载失败，使用默认图标或隐藏
                    this.style.display = 'none';
                };
            } else {
                // 如果没有 favicon，尝试从 URL 生成一个
                try {
                    const urlObj = new URL(entry.url);
                    faviconImg.src = `${urlObj.origin}/favicon.ico`;
                    faviconImg.onerror = function() {
                        this.style.display = 'none';
                    };
                } catch (e) {
                    faviconImg.style.display = 'none';
                }
            }

            // 标题
            const titleSpan = document.createElement('span');
            titleSpan.className = 'history-title';
            titleSpan.textContent = entry.title || entry.url || '無標題';

            // 删除按钮
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'history-delete-btn';
            deleteBtn.innerHTML = '<span class="material-symbols-sharp">close</span>';
            deleteBtn.title = '刪除';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                void removeGlobalHistoryEntry(entry);
            });

            // 时间
            const timeSpan = document.createElement('span');
            timeSpan.className = 'history-time';
            timeSpan.textContent = formatTime(entry.timestamp);

            contentDiv.appendChild(faviconImg);
            contentDiv.appendChild(titleSpan);
            contentDiv.appendChild(deleteBtn);

            li.appendChild(contentDiv);
            li.appendChild(timeSpan);

            li.title = entry.url;

            // 點擊歷史紀錄可以打開該網址（但排除删除按钮）
            li.addEventListener('click', (e) => {
                // 如果点击的是删除按钮，不执行打开操作
                if (e.target.closest('.history-delete-btn')) {
                    return;
                }
                openUrlFromUI(entry.url);
                // 點完自動切回分頁模式（可依喜好拿掉）
                sidebarMode = 'tabs';
                renderSidebarView();
            });

            historyList.appendChild(li);
        });
    }

    // 判斷內容類型
    function detectContentType(content) {
        if (!content) return 'text';
        
        // 檢查是否為 URL
        try {
            const url = new URL(content);
            const pathname = url.pathname.toLowerCase();
            
            // 檢查是否為圖片
            const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico'];
            if (imageExtensions.some(ext => pathname.endsWith(ext))) {
                return 'image';
            }
            
            // 檢查是否為視頻
            const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];
            if (videoExtensions.some(ext => pathname.endsWith(ext))) {
                return 'video';
            }
            
            // 檢查 URL 是否包含圖片或視頻的常見路徑
            if (pathname.includes('/image/') || pathname.includes('/img/') || pathname.includes('/photo/')) {
                return 'image';
            }
            if (pathname.includes('/video/') || pathname.includes('/v/') || pathname.includes('/watch')) {
                return 'video';
            }
            
            return 'url';
        } catch (e) {
            // 不是有效的 URL，視為普通文字
            return 'text';
        }
    }

    // 渲染複製暫存列表
    function renderClipboard() {
        if (!clipboardList) return;
        
        clipboardList.innerHTML = '';
        
        // 從新到舊顯示（clipboardHistory 已經是最新的在前面）
        clipboardHistory.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = 'clipboard-item';
            
            // 創建內容容器
            const contentContainer = document.createElement('div');
            contentContainer.className = 'clipboard-item-content';
            
            if (item.type === 'text') {
                // 文字內容（不使用圖標）
                const textDiv = document.createElement('div');
                textDiv.className = 'clipboard-item-text';
                textDiv.textContent = item.content;
                contentContainer.appendChild(textDiv);
                li.appendChild(contentContainer);
                
                li.addEventListener('click', async () => {
                    // 複製文字
                    try {
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                            await navigator.clipboard.writeText(item.content);
                        } else {
                            const textArea = document.createElement('textarea');
                            textArea.value = item.content;
                            textArea.style.position = 'fixed';
                            textArea.style.opacity = '0';
                            document.body.appendChild(textArea);
                            textArea.select();
                            document.execCommand('copy');
                            document.body.removeChild(textArea);
                        }
                        
                        // 顯示"已複製"反饋
                        const originalText = textDiv.textContent;
                        textDiv.textContent = '已複製';
                        
                        // 一秒後恢復原文字
                        setTimeout(() => {
                            textDiv.textContent = originalText;
                        }, 1000);
                    } catch (err) {
                        console.error('複製失敗:', err);
                    }
                });
            } else if (item.type === 'url') {
                // 網址（使用 link 圖標）
                const icon = document.createElement('span');
                icon.className = 'material-symbols-outlined clipboard-item-icon';
                icon.textContent = 'link';
                li.appendChild(icon);
                
                const urlDiv = document.createElement('div');
                urlDiv.className = 'clipboard-item-url';
                urlDiv.textContent = item.content;
                urlDiv.title = item.content; // 完整網址顯示在 tooltip
                contentContainer.appendChild(urlDiv);
                li.appendChild(contentContainer);
                
                li.addEventListener('click', () => {
                    // 訪問網址
                    openUrlFromUI(item.content);
                });
            } else if (item.type === 'image') {
                // 圖片（使用 image 圖標）
                const icon = document.createElement('span');
                icon.className = 'material-symbols-outlined clipboard-item-icon';
                icon.textContent = 'image';
                li.appendChild(icon);
                
                const img = document.createElement('img');
                img.className = 'clipboard-item-image';
                img.src = item.content;
                img.alt = '圖片';
                img.crossOrigin = 'anonymous';
                img.loading = 'lazy';
                img.onerror = function() {
                    // 如果圖片加載失敗，顯示網址
                    this.style.display = 'none';
                    const urlDiv = document.createElement('div');
                    urlDiv.className = 'clipboard-item-url';
                    urlDiv.textContent = item.content;
                    urlDiv.title = item.content; // 完整網址顯示在 tooltip
                    contentContainer.appendChild(urlDiv);
                };
                contentContainer.appendChild(img);
                
                const urlDiv = document.createElement('div');
                urlDiv.className = 'clipboard-item-url';
                urlDiv.textContent = item.content;
                urlDiv.title = item.content; // 完整網址顯示在 tooltip
                contentContainer.appendChild(urlDiv);
                li.appendChild(contentContainer);
                
                li.addEventListener('click', () => {
                    // 訪問圖片網址
                    openUrlFromUI(item.content);
                });
            } else if (item.type === 'video') {
                // 視頻（使用 video_library 圖標）
                const icon = document.createElement('span');
                icon.className = 'material-symbols-outlined clipboard-item-icon';
                icon.textContent = 'video_library';
                li.appendChild(icon);
                
                const videoContainer = document.createElement('div');
                videoContainer.style.position = 'relative';
                videoContainer.style.width = '100%';
                videoContainer.style.maxHeight = '200px';
                videoContainer.style.overflow = 'hidden';
                videoContainer.style.borderRadius = '4px';
                videoContainer.style.marginTop = '4px';
                videoContainer.style.backgroundColor = '#000';
                
                const video = document.createElement('video');
                video.className = 'clipboard-item-video';
                video.src = item.content;
                video.controls = false;
                video.muted = true;
                video.preload = 'metadata';
                video.playsInline = true;
                video.style.width = '100%';
                video.style.height = 'auto';
                video.style.display = 'block';
                
                // 嘗試加載並顯示第一幀作為縮略圖
                let thumbnailGenerated = false;
                
                video.onloadedmetadata = function() {
                    if (!thumbnailGenerated) {
                        try {
                            // 設置到第一秒以獲取縮略圖
                            video.currentTime = Math.min(1, video.duration / 2);
                        } catch (e) {
                            console.log('無法設置視頻時間:', e);
                        }
                    }
                };
                
                video.onseeked = function() {
                    if (!thumbnailGenerated) {
                        try {
                            // 當視頻跳轉到指定時間後，嘗試生成縮略圖
                            const canvas = document.createElement('canvas');
                            const maxWidth = 320;
                            const maxHeight = 240;
                            const aspectRatio = video.videoWidth / video.videoHeight;
                            
                            let canvasWidth = video.videoWidth;
                            let canvasHeight = video.videoHeight;
                            
                            if (canvasWidth > maxWidth) {
                                canvasWidth = maxWidth;
                                canvasHeight = maxWidth / aspectRatio;
                            }
                            if (canvasHeight > maxHeight) {
                                canvasHeight = maxHeight;
                                canvasWidth = maxHeight * aspectRatio;
                            }
                            
                            canvas.width = canvasWidth;
                            canvas.height = canvasHeight;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                            
                            // 將 canvas 轉換為圖片並替換 video 元素
                            const img = document.createElement('img');
                            img.className = 'clipboard-item-image';
                            img.src = canvas.toDataURL('image/png');
                            img.alt = '視頻縮略圖';
                            img.style.width = '100%';
                            img.style.height = 'auto';
                            img.style.display = 'block';
                            
                            // 替換 video 元素
                            videoContainer.replaceChild(img, video);
                            thumbnailGenerated = true;
                        } catch (e) {
                            // 跨域或其他錯誤，保持顯示 video 元素
                            console.log('無法生成視頻縮略圖（可能是跨域限制）:', e);
                            thumbnailGenerated = true; // 標記為已處理，避免重試
                        }
                    }
                };
                
                video.onerror = function() {
                    // 如果視頻加載失敗，顯示網址
                    videoContainer.style.display = 'none';
                    const urlDiv = document.createElement('div');
                    urlDiv.className = 'clipboard-item-url';
                    urlDiv.textContent = item.content;
                    urlDiv.title = item.content; // 完整網址顯示在 tooltip
                    contentContainer.appendChild(urlDiv);
                };
                
                videoContainer.appendChild(video);
                contentContainer.appendChild(videoContainer);
                
                const urlDiv = document.createElement('div');
                urlDiv.className = 'clipboard-item-url';
                urlDiv.textContent = item.content;
                urlDiv.title = item.content; // 完整網址顯示在 tooltip
                contentContainer.appendChild(urlDiv);
                li.appendChild(contentContainer);
                
                li.addEventListener('click', () => {
                    // 訪問視頻網址
                    openUrlFromUI(item.content);
                });
            }
            
            clipboardList.appendChild(li);
        });
    }

    // 添加複製內容到暫存
    function addToClipboardHistory(content) {
        if (!content) return;
        
        // 去重：檢查是否在最近 1 秒內添加了相同的內容
        const now = Date.now();
        const recentEntry = clipboardHistory.find(entry => {
            return entry.content === content && 
                   (now - entry.timestamp.getTime()) < 1000;
        });
        
        if (recentEntry) {
            // 如果最近已經添加過相同內容，不重複添加
            return;
        }
        
        const type = detectContentType(content);
        const entry = {
            type: type,
            content: content,
            timestamp: new Date()
        };
        
        // 添加到數組開頭（最新的在前面）
        clipboardHistory.unshift(entry);
        
        // 限制最多保存 50 條記錄
        if (clipboardHistory.length > 50) {
            clipboardHistory = clipboardHistory.slice(0, 50);
        }
        
        // 如果當前顯示的是複製暫存頁面，更新顯示
        if (sidebarMode === 'clipboard') {
            renderClipboard();
        }
    }

    function appendGlobalHistory(url) {
        const tab = getActiveTab();
        const newTimestamp = new Date();
        const entry = {
            url,
            title: tab && tab.title ? tab.title : '',
            favicon: tab && tab.favicon ? tab.favicon : null,
            tabId: tab ? tab.id : null,
            timestamp: newTimestamp.toISOString()
        };
        
        // 檢查是否有相同 URL 且時間相差小於一分鐘的舊記錄
        const oneMinuteInMs = 60 * 1000; // 1分鐘 = 60000毫秒
        const entriesToDelete = [];
        
        for (let i = globalHistory.length - 1; i >= 0; i--) {
            const existingEntry = globalHistory[i];
            if (existingEntry.url === url) {
                // 計算時間差
                const existingTimestamp = new Date(existingEntry.timestamp);
                const timeDiff = Math.abs(newTimestamp.getTime() - existingTimestamp.getTime());
                
                // 如果時間差小於1分鐘，標記為需要刪除
                if (timeDiff < oneMinuteInMs) {
                    entriesToDelete.push(i);
                }
            }
        }
        
        // 從後往前刪除，避免索引變化問題
        entriesToDelete.sort((a, b) => b - a); // 降序排列
        entriesToDelete.forEach(index => {
            const deletedEntry = globalHistory[index];
            globalHistory.splice(index, 1);
            
            // 如果使用 IPC，通知主進程刪除歷史記錄
            if (ipcRenderer) {
                ipcRenderer.send('history-delete', deletedEntry);
            }
        });
        
        // 添加新記錄
        globalHistory.push(entry);

        if (sidebarMode === 'history') {
            renderHistory();
        }

        if (ipcRenderer) {
            ipcRenderer.send('history-append', entry);
        }
        // 同步儲存到 localStorage，便於下次啟動還原
        try { saveGlobalHistoryToLocalStorage(); } catch (err) { /* ignore */ }
    }

    function navigateTo(url, options = {}) {
        const { addToHistory = true, overrideTitle } = options;
        const tab = getActiveTab();
        if (!tab) return;

        if (!tab.history) {
            tab.history = [];
            tab.historyIndex = -1;
        }

        if (addToHistory) {
            if (tab.historyIndex < tab.history.length - 1) {
                tab.history = tab.history.slice(0, tab.historyIndex + 1);
            }
            tab.history.push(url);
            tab.historyIndex = tab.history.length - 1;
        }

        tab.url = url;
        tab.lastHistoryUrl = url;
        syncTabPinnedState(tab);
        if (overrideTitle) {
            tab.title = overrideTitle;
        }

        suppressNextHistoryUpdate = true;
        webview.src = url;
        renderTabs();
        updateNavButtons();
        updateAddressInput();
    }

    function openUrlFromUI(url, options = {}) {
        navigateTo(url, { addToHistory: true, ...options });
    }

    function createTab(initialUrl = './src/home.html', initialTitle = '新分頁') {
        const id = nextTabId++;
        const tab = {
            id,
            title: initialTitle,
            url: '',
            history: [],
            historyIndex: -1,
            lastHistoryUrl: null,
            favicon: null,
            pinned: isUrlPinned(initialUrl)
        };
        tabs.push(tab);
        activeTabId = id;
        renderTabs();
        navigateTo(initialUrl, { addToHistory: true, overrideTitle: initialTitle });
    }

    function closeTab(id) {
        const index = tabs.findIndex(t => t.id === id);
        if (index === -1) return;

        tabs.splice(index, 1);

        if (tabs.length === 0) {
            createTab();
        } else {
            if (id === activeTabId) {
                const newIndex = Math.min(index, tabs.length - 1);
                activeTabId = tabs[newIndex].id;
                const newTab = getActiveTab();
                if (newTab && newTab.url) {
                    suppressNextHistoryUpdate = true;
                    webview.src = newTab.url;
                }
                updateAddressInput();
            }
            renderTabs();
            updateNavButtons();
        }
    }

    function activateTab(id) {
        activeTabId = id;
        const tab = getActiveTab();
        if (!tab) return;

        if (tab.url) {
            suppressNextHistoryUpdate = true;
            webview.src = tab.url;
        } else {
            navigateTo('./src/home.html', { addToHistory: true });
        }
        renderTabs();
        updateNavButtons();
        updateAddressInput();
    }

    // 更新指定分頁的 URL
    function navigateTabToUrl(tabId, url) {
        const tab = tabs.find(t => t.id === tabId);
        if (!tab) return;

        // 處理 URL 格式
        let finalUrl = url.trim();
        if (!finalUrl) return;

        // 如果不是完整的 URL，添加 http://
        if (
            !finalUrl.startsWith('http://') &&
            !finalUrl.startsWith('https://') &&
            !finalUrl.startsWith('./') &&
            !finalUrl.startsWith('file://')
        ) {
            finalUrl = 'http://' + finalUrl;
        }

        const wasActive = tab.id === activeTabId;
        
        if (!tab.history) {
            tab.history = [];
            tab.historyIndex = -1;
        }

        // 清除歷史記錄，重新開始
        tab.history = [finalUrl];
        tab.historyIndex = 0;
        tab.url = finalUrl;
        tab.lastHistoryUrl = finalUrl;
        syncTabPinnedState(tab);

        // 如果這個分頁是活動分頁，更新 webview
        if (wasActive) {
            suppressNextHistoryUpdate = true;
            webview.src = finalUrl;
            addressInput.value = finalUrl;
        }

        renderTabs();
        updateNavButtons();
        if (wasActive) {
            updateAddressInput();
        }
    }

    function goBackInActiveTab() {
        const tab = getActiveTab();
        if (!tab || !tab.history || tab.historyIndex <= 0) return;

        // 使用者按下「上一頁」時，刪除階層位址欄中最後一個按鈕
        ensureBreadcrumbModel(tab);
        if (tab.breadcrumbButtons && tab.breadcrumbButtons.length > 0) {
            tab.breadcrumbButtons.pop();
            tab.breadcrumbActiveIndex = tab.breadcrumbButtons.length - 1;
        }

        tab.historyIndex--;
        const url = tab.history[tab.historyIndex];
        tab.url = url;
        tab.lastHistoryUrl = url;
        syncTabPinnedState(tab);

        historyJumpInProgress = true;
        webview.src = url;
        renderTabs();
        updateNavButtons();
        updateAddressInput();
    }

    function goForwardInActiveTab() {
        const tab = getActiveTab();
        if (!tab || !tab.history || tab.historyIndex >= tab.history.length - 1) return;

        tab.historyIndex++;
        const url = tab.history[tab.historyIndex];
        tab.url = url;
        tab.lastHistoryUrl = url;
        syncTabPinnedState(tab);

        historyJumpInProgress = true;
        webview.src = url;
        renderTabs();
        updateNavButtons();
        updateAddressInput();
    }

    function handleSearch(query) {
        if (!query) return;

        const engine = localStorage.getItem('search-engine') || 'google';
        let url = '';

        // 如果包含 site: 语法，直接作为搜索查询处理
        const hasSiteSyntax = query.toLowerCase().includes('site:');
        
        // 检查是否是 URL（以 http:// 或 https:// 开头）
        const isUrl = query.startsWith('http://') || query.startsWith('https://');
        
        // 如果包含 site: 语法或是明确的 URL，或者不包含点号，则作为搜索查询
        if (hasSiteSyntax || isUrl || !query.includes('.')) {
            if (isUrl) {
                url = query;
        } else {
                // 作为搜索查询处理
            switch (engine) {
                case 'bing':
                    url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
                    break;
                case 'duck':
                    url = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
                    break;
                case 'google':
                default:
                    url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
                    break;
            }
            }
        } else {
            // 包含点号但没有 site: 语法，可能是域名，尝试作为 URL
            url = 'http://' + query;
        }

        openUrlFromUI(url);
    }

    function onWebviewNavigation(url) {
        const tab = getActiveTab();
        if (!tab) {
            appendGlobalHistory(url);
            return;
        }

        if (suppressNextHistoryUpdate) {
            suppressNextHistoryUpdate = false;
            tab.url = url;
            tab.lastHistoryUrl = url;
            syncTabPinnedState(tab);
            renderTabs();
            updateNavButtons();
            updateBreadcrumbOnNavigation(url, 'jump');
        } else if (historyJumpInProgress) {
            historyJumpInProgress = false;
            tab.url = url;
            tab.lastHistoryUrl = url;
            syncTabPinnedState(tab);
            renderTabs();
            updateNavButtons();
            updateBreadcrumbOnNavigation(url, 'jump');
        } else {
            if (!tab.history) {
                tab.history = [];
                tab.historyIndex = -1;
            }

            if (tab.lastHistoryUrl !== url) {
                if (tab.historyIndex < tab.history.length - 1) {
                    tab.history = tab.history.slice(0, tab.historyIndex + 1);
                }
                tab.history.push(url);
                tab.historyIndex = tab.history.length - 1;
                tab.url = url;
                tab.lastHistoryUrl = url;
                syncTabPinnedState(tab);
                renderTabs();
                updateNavButtons();
                updateBreadcrumbOnNavigation(url, 'new');
            }
        }

        // 注意：全域歷史記錄將在頁面標題更新時添加（確保有正確的標題和 favicon）
        updateAddressInput();
    }

    // -------- 事件綁定 --------

    // 載入保存的側邊欄寬度
    function loadSidebarWidth() {
        const savedWidth = localStorage.getItem('sidebar-width');
        if (savedWidth) {
            sidebar.style.width = savedWidth + 'px';
            sidebar.style.transition = 'none'; // 初始化時不使用動畫
            setTimeout(() => {
                sidebar.style.transition = ''; // 恢復動畫
            }, 0);
        }
    }

    // 保存側邊欄寬度
    function saveSidebarWidth(width) {
        localStorage.setItem('sidebar-width', width);
    }

    // 載入並應用側邊欄位置
    function loadSidebarPosition() {
        const position = localStorage.getItem('sidebar-position') || 'left';
        applySidebarPosition(position);
    }

    // 應用側邊欄位置
    function applySidebarPosition(position) {
        if (!browserContent) return;
        
        if (position === 'right') {
            browserContent.classList.add('sidebar-right');
            if (toggleSidebarButton) toggleSidebarButton.style.display = 'none';
            if (toggleSidebarRightButton) toggleSidebarRightButton.style.display = '';
        } else {
            browserContent.classList.remove('sidebar-right');
            if (toggleSidebarButton) toggleSidebarButton.style.display = '';
            if (toggleSidebarRightButton) toggleSidebarRightButton.style.display = 'none';
        }
    }

    // -------- 釘選分頁：載入 / 儲存 --------
    function loadPinnedTabs() {
        pinnedTabUrls = [];
        try {
            const stored = localStorage.getItem('pinned-tabs');
            if (stored) {
                const arr = JSON.parse(stored);
                if (Array.isArray(arr)) {
                    pinnedTabUrls = arr.filter(u => typeof u === 'string' && u.trim().length > 0);
                }
            }
        } catch (e) {
            console.warn('載入釘選分頁失敗', e);
            pinnedTabUrls = [];
        }
    }

    function savePinnedTabs() {
        try {
            localStorage.setItem('pinned-tabs', JSON.stringify(pinnedTabUrls));
        } catch (e) {
            console.warn('儲存釘選分頁失敗', e);
        }
    }

    function isUrlPinned(url) {
        if (!url) return false;
        return pinnedTabUrls.includes(url);
    }

    function addPinnedUrl(url) {
        if (!url) return;
        if (!pinnedTabUrls.includes(url)) {
            pinnedTabUrls.push(url);
            savePinnedTabs();
        }
        syncPinnedStateForUrl(url);
        updateBookmarkButtonState();
    }

    function removePinnedUrl(url) {
        if (!url) return;
        pinnedTabUrls = pinnedTabUrls.filter(u => u !== url);
        savePinnedTabs();
        syncPinnedStateForUrl(url);
        updateBookmarkButtonState();
    }

    function toggleTabPinned(tabId) {
        const tab = tabs.find(t => t.id === tabId);
        if (!tab || !tab.url) return;

        if (tab.pinned) {
            tab.pinned = false;
            removePinnedUrl(tab.url);
        } else {
            tab.pinned = true;
            addPinnedUrl(tab.url);
        }
        renderTabs();
        injectPersonalCenterBookmarks();
    }

    // 側邊欄調整寬度（拖動）
    if (sidebarResizer && sidebar) {
        let isResizing = false;
        let startX = 0;
        let startWidth = 0;

        sidebarResizer.addEventListener('mousedown', (e) => {
            if (browserContent.classList.contains('sidebar-collapsed')) {
                return;
            }
            isResizing = true;
            startX = e.clientX;
            startWidth = sidebar.offsetWidth;
            sidebarResizer.classList.add('resizing');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            
            // 如果側邊欄被折疊，停止調整
            if (browserContent.classList.contains('sidebar-collapsed')) {
                isResizing = false;
                sidebarResizer.classList.remove('resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                return;
            }

            // 計算寬度變化（考慮側邊欄在右側時的方向）
            const isRight = browserContent.classList.contains('sidebar-right');
            const diff = isRight ? (startX - e.clientX) : (e.clientX - startX);
            const newWidth = Math.max(150, Math.min(600, startWidth + diff)); // 最小150px，最大600px
            sidebar.style.width = newWidth + 'px';
            sidebar.style.transition = 'none'; // 拖動時禁用動畫
            saveSidebarWidth(newWidth);
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                sidebarResizer.classList.remove('resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                sidebar.style.transition = ''; // 恢復動畫
            }
        });
    }

    // 側邊欄開關（動畫）
    function toggleSidebar() {
        const collapsed = browserContent.classList.toggle('sidebar-collapsed');
        const icon = collapsed ? '☷' : '☰';
        toggleSidebarButton.textContent = icon;
        toggleSidebarRightButton.textContent = icon;
        
        if (collapsed) {
            // 折疊時：清除內聯樣式，讓 CSS 的 width: 0 生效
            sidebar.style.width = '';
            sidebar.style.minWidth = '';
        } else {
            // 展開時：恢復保存的寬度
            const savedWidth = localStorage.getItem('sidebar-width');
            if (savedWidth) {
                sidebar.style.width = savedWidth + 'px';
            } else {
                sidebar.style.width = '220px'; // 默認寬度
            }
        }
        // 只要執行一次顯式開關，就視為非自動開啟狀態
        if (collapsed) {
            sidebarAutoOpened = false;
        }
    }

    if (toggleSidebarButton && browserContent) {
        toggleSidebarButton.addEventListener('click', () => {
            // 使用者手動點擊，關閉自動開啟狀態
            sidebarAutoOpened = false;
            toggleSidebar();
        });
    }

    if (toggleSidebarRightButton && browserContent) {
        toggleSidebarRightButton.addEventListener('click', () => {
            sidebarAutoOpened = false;
            toggleSidebar();
        });
    }

    // 側邊欄「滑到邊緣自動展開」功能（僅在側邊欄處於關閉狀態時生效）
    if (browserContent && sidebar) {
        const EDGE_THRESHOLD = 4; // 靠近邊緣的判定距離（像素）

        document.addEventListener('mousemove', (e) => {
            // 只有在側邊欄關閉時，才啟用自動開啟邏輯
            const isCollapsed = browserContent.classList.contains('sidebar-collapsed');
            if (!isCollapsed || sidebarAutoOpened) {
                return;
            }

            const rect = browserContent.getBoundingClientRect();
            const isRight = browserContent.classList.contains('sidebar-right');

            let nearEdge = false;
            if (isRight) {
                // 側邊欄在右側：滑鼠靠近 browser-content 右邊緣
                nearEdge = (rect.right - e.clientX) <= EDGE_THRESHOLD && (rect.right - e.clientX) >= 0;
            } else {
                // 側邊欄在左側：滑鼠靠近 browser-content 左邊緣
                nearEdge = (e.clientX - rect.left) <= EDGE_THRESHOLD && (e.clientX - rect.left) >= 0;
            }

            if (nearEdge) {
                // 從關閉狀態，因滑鼠靠邊而自動暫時開啟
                sidebarAutoOpened = true;
                toggleSidebar();
            }
        });

        // 當滑鼠離開側邊欄區域時，如果是自動開啟的側邊欄，則自動關閉
        sidebar.addEventListener('mouseleave', () => {
            if (!sidebarAutoOpened) return;
            // 僅在目前未折疊時才關閉
            if (!browserContent.classList.contains('sidebar-collapsed')) {
                sidebarAutoOpened = false;
                toggleSidebar();
            }
        });
    }

    // 主頁按鈕
    if (homeButton) {
        homeButton.addEventListener('click', () => {
            openUrlFromUI(getConfiguredHomeUrl(), { overrideTitle: '首頁' });
        });
    }

    // 重新載入按鈕
    if (reloadButton) {
        reloadButton.addEventListener('click', () => {
            if (webview) {
                webview.reload();
            }
        });
    }

    // 設定按鈕
    if (settingsButton) {
        settingsButton.addEventListener('click', () => {
            const settingsUrl = './src/settings.html';
            if (isActiveToolPageOpen(isSettingsPage)) {
                closeActiveToolPage();
            } else {
                openToolPage(settingsUrl, '設定');
            }
        });
    }

    // 個人中心（與設定鈕相同：再按一次關閉＝返回上一頁或首頁）
    if (personalCenterButton) {
        personalCenterButton.addEventListener('click', () => {
            const personalUrl = './personal-center.html';
            if (isActiveToolPageOpen(isPersonalCenterPage)) {
                closeActiveToolPage();
            } else {
                openToolPage(personalUrl, '個人中心');
            }
        });
    }

    // 側邊欄模式切換：分頁 / 歷史 / 複製暫存
    if (sidebarModeTabsBtn && sidebarModeHistoryBtn && sidebarModeClipboardBtn) {
        sidebarModeTabsBtn.addEventListener('click', () => {
            sidebarMode = 'tabs';
            renderSidebarView();
        });
        sidebarModeHistoryBtn.addEventListener('click', () => {
            sidebarMode = 'history';
            renderSidebarView();
            renderHistory();
        });
        sidebarModeClipboardBtn.addEventListener('click', () => {
            sidebarMode = 'clipboard';
            renderSidebarView();
            renderClipboard();
        });
    }

    // 地址列導航
    function navigateFromAddressBar() {
        let url = addressInput.value.trim();
        if (!url) return;

        if (
            !url.startsWith('http://') &&
            !url.startsWith('https://') &&
            !url.startsWith('./')
        ) {
            url = 'http://' + url;
        }

        openUrlFromUI(url);
    }

    // 地址列點擊時選中所有文本
    addressInput.addEventListener('focus', () => {
        addressInput.select();
    });

    addressInput.addEventListener('input', updateBookmarkButtonState);

    // 地址列拖拽處理
    addressInput.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        addressInput.style.backgroundColor = '#e8f4f8';
    });

    addressInput.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        addressInput.style.backgroundColor = '';
    });

    addressInput.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        addressInput.style.backgroundColor = '';

        // 獲取拖拽的文本
        const text = e.dataTransfer.getData('text/plain');
        if (text) {
            addressInput.value = text;
            addressInput.select();
            updateBookmarkButtonState();
        }
    });

    if (bookmarkButton) {
        bookmarkButton.addEventListener('click', () => {
            const url = getBookmarkUrlFromAddressInput();
            if (!url) return;

            if (isUrlPinned(url)) {
                removePinnedUrl(url);
            } else {
                addPinnedUrl(url);
            }
            renderTabs();
            injectPersonalCenterBookmarks();
            updateBookmarkButtonState();
        });
    }

    goButton.addEventListener('click', navigateFromAddressBar);
    addressInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            navigateFromAddressBar();
        }
    });

    navBack.addEventListener('click', () => {
        goBackInActiveTab();
    });

    navForward.addEventListener('click', () => {
        goForwardInActiveTab();
    });

    // 上一頁 / 下一頁 預覽：滑鼠進入顯示，離開隱藏
    if (navBack) {
        navBack.addEventListener('mouseenter', () => {
            showNavPreview('back');
        });
        navBack.addEventListener('mouseleave', () => {
            hideNavPreview();
        });
    }

    if (navForward) {
        navForward.addEventListener('mouseenter', () => {
            showNavPreview('forward');
        });
        navForward.addEventListener('mouseleave', () => {
            hideNavPreview();
        });
    }

    if (navPreview) {
        navPreview.addEventListener('mouseleave', () => {
            hideNavPreview();
        });
    }

    // 新增分頁
    addTabButton.addEventListener('click', () => {
        createTab('./src/home.html', '新分頁');
    });

    // 切換縮圖檢視模式
    if (toggleThumbnailViewButton) {
        toggleThumbnailViewButton.addEventListener('click', () => {
            thumbnailViewMode = !thumbnailViewMode;
            updateThumbnailViewButton();
            renderTabs();
        });
        
        function updateThumbnailViewButton() {
            const icon = toggleThumbnailViewButton.querySelector('.material-symbols-sharp');
            if (icon) {
                icon.textContent = thumbnailViewMode ? 'grid_view' : 'view_list';
            }
        }
        
        // 初始化按钮图标
        updateThumbnailViewButton();
    }

    // 分頁列表拖拽處理（用於外部 URL 拖拽和內部排序）
    let draggedOverTabId = null;
    let draggedTabId = null; // 被拖拽的 tab ID（用于内部排序）

    tabsList.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // 獲取拖拽位置下的元素
        const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
        if (elementBelow) {
            // 查找分頁項
            const tabItem = elementBelow.closest('.tab-item');
            if (tabItem) {
                const tabId = parseInt(tabItem.dataset.tabId);
                
                // 如果是内部排序（draggedTabId 存在），只处理排序
                if (draggedTabId !== null && draggedTabId !== tabId) {
                    if (draggedOverTabId !== tabId) {
                        // 清除之前的高亮
                        if (draggedOverTabId !== null) {
                            const prevItem = tabsList.querySelector(`[data-tab-id="${draggedOverTabId}"]`);
                            if (prevItem) {
                                prevItem.style.backgroundColor = '';
                            }
                        }
                        // 高亮當前分頁項
                        draggedOverTabId = tabId;
                        tabItem.style.backgroundColor = '#e0eaff';
                    }
                } else if (draggedTabId === null) {
                    // 外部拖拽（URL）
                    if (draggedOverTabId !== tabId) {
                        // 清除之前的高亮
                        if (draggedOverTabId !== null) {
                            const prevItem = tabsList.querySelector(`[data-tab-id="${draggedOverTabId}"]`);
                            if (prevItem) {
                                prevItem.style.backgroundColor = '';
                            }
                        }
                        // 高亮當前分頁項
                        draggedOverTabId = tabId;
                        tabItem.style.backgroundColor = '#e0eaff';
                    }
                }
            } else {
                // 如果不在分頁項上，清除高亮
                if (draggedOverTabId !== null) {
                    const prevItem = tabsList.querySelector(`[data-tab-id="${draggedOverTabId}"]`);
                    if (prevItem) {
                        prevItem.style.backgroundColor = '';
                    }
                    draggedOverTabId = null;
                }
            }
        }
    });

    tabsList.addEventListener('dragleave', (e) => {
        // 清除所有分頁項的高亮
        if (draggedOverTabId !== null) {
            const prevItem = tabsList.querySelector(`[data-tab-id="${draggedOverTabId}"]`);
            if (prevItem) {
                prevItem.style.backgroundColor = '';
            }
            draggedOverTabId = null;
        }
    });

    tabsList.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // 清除所有分頁項的高亮
        if (draggedOverTabId !== null) {
            const prevItem = tabsList.querySelector(`[data-tab-id="${draggedOverTabId}"]`);
            if (prevItem) {
                prevItem.style.backgroundColor = '';
            }
        }

        // 獲取拖拽的數據
        const data = e.dataTransfer.getData('text/plain');
        if (!data) {
            draggedOverTabId = null;
            draggedTabId = null;
            return;
        }

        // 判斷是內部排序還是外部 URL 拖拽
        const isTabId = /^\d+$/.test(data.trim());
        
        if (isTabId && draggedTabId !== null) {
            // 內部排序：重新排列 tabs 數組
            const sourceTabId = parseInt(data);
            const targetTabId = draggedOverTabId;
            
            if (targetTabId && sourceTabId !== targetTabId) {
                // 找到源和目標 tab 的索引
                const sourceIndex = tabs.findIndex(t => t.id === sourceTabId);
                const targetIndex = tabs.findIndex(t => t.id === targetTabId);
                
                if (sourceIndex !== -1 && targetIndex !== -1) {
                    // 從原位置移除
                    const [movedTab] = tabs.splice(sourceIndex, 1);
                    // 插入到新位置
                    tabs.splice(targetIndex, 0, movedTab);
                    
                    // 重新渲染
                    renderTabs();
                }
            }
        } else {
            // 外部 URL 拖拽：處理 URL
            let cleanUrl = data.trim();
            if (!cleanUrl || cleanUrl.startsWith('javascript:')) {
                draggedOverTabId = null;
                draggedTabId = null;
                return;
            }

            // 處理 URL 格式（如果不是完整 URL，添加 http://）
            if (
                !cleanUrl.startsWith('http://') &&
                !cleanUrl.startsWith('https://') &&
                !cleanUrl.startsWith('./') &&
                !cleanUrl.startsWith('file://')
            ) {
                cleanUrl = 'http://' + cleanUrl;
            }

            // 獲取拖拽位置下的元素
            const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
            if (elementBelow) {
                // 查找分頁項
                const tabItem = elementBelow.closest('.tab-item');
                if (tabItem) {
                    // 如果在分頁項上方，取代該分頁的網址
                    const tabId = parseInt(tabItem.dataset.tabId);
                    navigateTabToUrl(tabId, cleanUrl);
                    draggedOverTabId = null;
                    draggedTabId = null;
                    return;
                }
            }

            // 如果不在分頁項上方，新增一個分頁
            createTab(cleanUrl, '新分頁');
        }
        
        draggedOverTabId = null;
        draggedTabId = null;
    });

    const PERSONAL_CENTER_HISTORY_JSON_MAX = 480000;

    function buildPersonalCenterHistoryPayload() {
        const visitCounts = new Map();
        globalHistory.forEach(e => {
            if (!e || !e.url) return;
            visitCounts.set(e.url, (visitCounts.get(e.url) || 0) + 1);
        });
        const reversed = globalHistory.slice().reverse();
        let entries = reversed.map(e => ({
            url: e.url,
            title: e.title || e.url || '無標題',
            favicon: e.favicon || null,
            timestamp: e.timestamp,
            tabId: e.tabId != null ? e.tabId : null,
            thumbnail: e.thumbnail || null,
            visitCount: visitCounts.get(e.url) || 1
        }));
        let json = JSON.stringify(entries);
        while (json.length > PERSONAL_CENTER_HISTORY_JSON_MAX) {
            let removed = false;
            for (let i = entries.length - 1; i >= 0; i--) {
                if (entries[i].thumbnail) {
                    entries[i].thumbnail = null;
                    removed = true;
                    break;
                }
            }
            if (!removed) break;
            json = JSON.stringify(entries);
        }
        return entries;
    }

    function injectPersonalCenterBookmarks() {
        if (!webview) return;
        loadPinnedTabs();
        const list = pinnedTabUrls.map(url => {
            let title = url;
            for (let i = globalHistory.length - 1; i >= 0; i--) {
                if (globalHistory[i].url === url && globalHistory[i].title) {
                    title = globalHistory[i].title;
                    break;
                }
            }
            if (title === url) {
                try {
                    title = new URL(url).hostname || url;
                } catch (err) {
                    /* keep url */
                }
            }
            return { url, title };
        });
        const js = `window.personalCenter && window.personalCenter.setBookmarks(${JSON.stringify(list)})`;
        webview.executeJavaScript(js).catch(err => console.warn('inject bookmarks failed', err));
    }

    function injectPersonalCenterHistory() {
        if (!webview) return;
        const entries = buildPersonalCenterHistoryPayload();
        const js = `window.personalCenter && window.personalCenter.setHistory(${JSON.stringify(entries)})`;
        webview.executeJavaScript(js).catch(err => console.warn('inject history failed', err));
    }

    function injectPersonalCenterData() {
        injectPersonalCenterHistory();
        injectPersonalCenterBookmarks();
    }

    // WebView IPC（首頁搜尋 / 設定頁）
    webview.addEventListener('ipc-message', (event) => {
        switch (event.channel) {
            case 'show-context-menu':
                // 从 webview 内部触发的右键菜单
                const data = event.args[0];
                console.log('Received show-context-menu IPC:', data);
                if (data && data._action === 'hide') {
                    hideContextMenu();
                } else if (data) {
                    selectedText = data.selectedText || '';
                    selectedUrl = data.selectedUrl || '';
                    const hasSelection = data.hasSelection || false;
                    const hasUrl = data.hasUrl || false;
                    const isEditable = data.isEditable || false;
                    const elementInfo = data.elementInfo || null;
                    console.log('Processing menu data - hasSelection:', hasSelection, 'hasUrl:', hasUrl, 'isEditable:', isEditable);
                    const now = Date.now();
                    if (now < contextMenuToggleLockUntil) return;
                    contextMenuToggleLockUntil = now + 200;
                    // 如果菜单已显示，则隐藏；否则显示
                    if (isContextMenuVisible()) {
                        hideContextMenu();
                    } else {
                        showContextMenuWithData(hasSelection, hasUrl, isEditable, elementInfo);
                    }
                } else {
                    console.warn('show-context-menu data is null or undefined');
                }
                break;
            case 'hide-context-menu':
                hideContextMenu();
                break;
            case 'copy-content':
                // 从 webview 内部触发的复制事件
                const content = event.args[0];
                if (content && content.trim()) {
                    addToClipboardHistory(content.trim());
                }
                break;
            case 'search':
                handleSearch(event.args[0]);
                break;
            case 'open-settings': {
                console.log('Opening settings page...');
                const settingsUrl = './src/settings.html';
                openUrlFromUI(settingsUrl, { overrideTitle: '設定' });
                break;
            }
            case 'open-downloads': {
                console.log('Opening downloads panel...');
                showDownloadsPanel();
                break;
            }
            case 'open-personal-center-bookmarks': {
                console.log('Opening personal center bookmarks...');
                openToolPage('./personal-center.html#bookmarks', '個人中心');
                break;
            }
            case 'open-in-new-tab': {
                console.log('open-in-new-tab', event.args[0]);
                const url = event.args[0];
                if (url && url !== 'about:blank' && !url.startsWith('javascript:')) {
                    createTab(url, '新分頁');
                }
                break;
            }
            case 'navigate-to-url': {
                console.log('navigate-to-url', event.args[0]);
                // 如果鏈接無法正常導航，自動填入網址欄並訪問
                const url = event.args[0];
                if (url && url !== 'about:blank' && !url.startsWith('javascript:')) {
                    addressInput.value = url;
                    openUrlFromUI(url);
                }
                break;
            }
            case 'sidebar-position-changed': {
                // 側邊欄位置變更
                const position = event.args[0];
                applySidebarPosition(position);
                break;
            }
            case 'request-personal-center-data':
                injectPersonalCenterData();
                break;
            case 'delete-history-entry': {
                const payload = event.args[0];
                if (payload && payload.url && payload.timestamp != null) {
                    void removeGlobalHistoryEntry(payload);
                }
                break;
            }
            case 'delete-bookmark': {
                const url = event.args[0];
                if (typeof url === 'string' && url) {
                    removePinnedUrl(url);
                    renderTabs();
                    injectPersonalCenterBookmarks();
                }
                break;
            }
        }
    });

    // WebView 導航事件
    webview.addEventListener('did-navigate', (event) => {
        onWebviewNavigation(event.url);
    });

    webview.addEventListener('did-navigate-in-page', (event) => {
        onWebviewNavigation(event.url);
    });

    // 當頁面載入完成時，擷取當前頁面的縮圖
    webview.addEventListener('did-stop-loading', () => {
        captureCurrentPageThumbnail();
    });

    webview.addEventListener('did-finish-load', () => {
        try {
            const u = webview.getURL() || '';
            if (u.toLowerCase().includes('personal-center.html')) {
                injectPersonalCenterData();
            }
        } catch (e) {
            /* ignore */
        }
    });

    // 攔截所有導航請求，確保鏈接點擊能正常工作
    webview.addEventListener('will-navigate', (event) => {
        // 允許導航，但確保地址欄會更新
        const url = event.url;
        if (url && url !== 'about:blank' && !url.startsWith('javascript:')) {
            // 自動更新地址欄
            addressInput.value = url;
            updateBookmarkButtonState();
            // 導航會自動進行，不需要阻止
            // 確保導航正常進行
        }
    });

    // 處理新窗口/標籤頁打開（如搜索結果中的鏈接）
    webview.addEventListener('new-window', (event) => {
        // 阻止在新窗口中打開，改為創建新標籤頁
        event.preventDefault();
        const url = event.url;
        if (url && url !== 'about:blank' && !url.startsWith('javascript:')) {
            // 創建新標籤頁並打開鏈接
            createTab(url, '新分頁');
        }
    });

    // 在 webview 加載完成後注入腳本，攔截所有鏈接點擊和右鍵事件
    webview.addEventListener('dom-ready', () => {
        // 注入腳本來攔截所有鏈接點擊和右鍵事件
        webview.executeJavaScript(`
            (function() {
                // 左键点击页面时，通知隐藏右键菜单
                document.addEventListener('mousedown', function(e) {
                    if (e.button !== 0) return;
                    try {
                        if (window.MiniBrowserAPI && window.MiniBrowserAPI.showContextMenu) {
                            window.MiniBrowserAPI.showContextMenu({ _action: 'hide' });
                        } else if (window.require) {
                            const { ipcRenderer } = window.require('electron');
                            if (ipcRenderer) {
                                ipcRenderer.sendToHost('hide-context-menu');
                            }
                        }
                    } catch (err) {
                        // ignore
                    }
                }, true);

                // 攔截右鍵事件 - 使用 contextmenu 事件实现单击切换
                document.addEventListener('contextmenu', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const selection = window.getSelection().toString().trim();
                    const target = e.target;
                    
                    // 获取元素 URL
                    let elementUrl = null;
                    
                    // 检查是否是链接
                    if (target.tagName === 'A' && target.href) {
                        elementUrl = target.href;
                    }
                    // 检查是否是图片
                    else if (target.tagName === 'IMG' && target.src) {
                        elementUrl = target.src;
                    }
                    // 检查是否是视频
                    else if (target.tagName === 'VIDEO' && target.src) {
                        elementUrl = target.src;
                    }
                    // 检查父元素是否是链接
                    else {
                        const parentLink = target.closest('a');
                        if (parentLink && parentLink.href) {
                            elementUrl = parentLink.href;
                        }
                        // 检查父元素是否是图片
                        else {
                            const parentImg = target.closest('img');
                            if (parentImg && parentImg.src) {
                                elementUrl = parentImg.src;
                            }
                            // 检查父元素是否是视频
                            else {
                                const parentVideo = target.closest('video');
                                if (parentVideo && parentVideo.src) {
                                    elementUrl = parentVideo.src;
                                }
                            }
                        }
                    }
                    
                    // 检查是否是可编辑元素
                    let isEditable = false;
                    let elementInfo = null;
                    
                    // 检查目标元素或父元素是否是可编辑的
                    let editableTarget = target;
                    
                    // 首先检查目标元素本身
                    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                        editableTarget = target;
                    } else {
                        // 如果目标元素不是可编辑的，查找父元素
                        editableTarget = target.closest('input, textarea, [contenteditable="true"], [contenteditable]');
                    }
                    
                    if (editableTarget && (
                        editableTarget.tagName === 'INPUT' || 
                        editableTarget.tagName === 'TEXTAREA' || 
                        editableTarget.isContentEditable ||
                        editableTarget.getAttribute('contenteditable') === 'true'
                    )) {
                        isEditable = true;
                        // 收集元素信息以便后续定位
                        const allSameTag = document.getElementsByTagName(editableTarget.tagName);
                        elementInfo = {
                            tagName: editableTarget.tagName,
                            id: editableTarget.id || null,
                            className: editableTarget.className ? String(editableTarget.className) : null,
                            name: editableTarget.name || null,
                            index: Array.from(allSameTag).indexOf(editableTarget)
                        };
                        console.log('Editable element detected:', elementInfo);
                    } else {
                        console.log('No editable element found, target:', target.tagName, 'isContentEditable:', target.isContentEditable);
                    }
                    
                    console.log('Webview right click detected, selection:', selection, 'url:', elementUrl, 'isEditable:', isEditable);
                    
                    const menuData = {
                        hasSelection: selection.length > 0,
                        selectedText: selection,
                        hasUrl: !!elementUrl,
                        selectedUrl: elementUrl || '',
                        isEditable: isEditable,
                        elementInfo: elementInfo
                    };
                    
                    if (window.MiniBrowserAPI && window.MiniBrowserAPI.showContextMenu) {
                        // 使用 contextBridge API
                        try {
                            console.log('Using MiniBrowserAPI.showContextMenu');
                            window.MiniBrowserAPI.showContextMenu(menuData);
                        } catch(err) {
                            console.warn('Failed to show context menu via MiniBrowserAPI:', err);
                        }
                    } else if (window.require) {
                        try {
                            const { ipcRenderer } = window.require('electron');
                            if (ipcRenderer) {
                                console.log('Using ipcRenderer.sendToHost');
                                ipcRenderer.sendToHost('show-context-menu', menuData);
                            }
                        } catch(err) {
                            console.warn('Failed to use ipcRenderer:', err);
                        }
                    } else {
                        console.warn('No API available for context menu');
                    }
                }, true);

                // 攔截中鍵點擊（auxclick 事件）
                document.addEventListener('auxclick', function(e) {
                    if (e.button !== 1) return; // 只处理中键（button === 1）
                    
                    let target = e.target;
                    let elementUrl = null;
                    
                    // 检查是否是链接
                    if (target.tagName === 'A' && target.href) {
                        elementUrl = target.href;
                    }
                    // 检查是否是图片
                    else if (target.tagName === 'IMG' && target.src) {
                        elementUrl = target.src;
                    }
                    // 检查是否是视频
                    else if (target.tagName === 'VIDEO' && target.src) {
                        elementUrl = target.src;
                    }
                    // 检查父元素是否是链接
                    else {
                        const parentLink = target.closest('a');
                        if (parentLink && parentLink.href) {
                            elementUrl = parentLink.href;
                        }
                        // 检查父元素是否是图片
                        else {
                            const parentImg = target.closest('img');
                            if (parentImg && parentImg.src) {
                                elementUrl = parentImg.src;
                            }
                            // 检查父元素是否是视频
                            else {
                                const parentVideo = target.closest('video');
                                if (parentVideo && parentVideo.src) {
                                    elementUrl = parentVideo.src;
                                }
                            }
                        }
                    }
                    
                    // 如果找到有效的 URL，阻止默认行为并在新标签页打开
                    if (elementUrl && !elementUrl.startsWith('javascript:') && !elementUrl.startsWith('#') && elementUrl !== 'about:blank') {
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        
                        try {
                            if (window.MiniBrowserAPI && window.MiniBrowserAPI.openInNewTab) {
                                window.MiniBrowserAPI.openInNewTab(elementUrl);
                            } else if (window.require) {
                                const { ipcRenderer } = window.require('electron');
                                if (ipcRenderer) {
                                    ipcRenderer.sendToHost('open-in-new-tab', elementUrl);
                                }
                            }
                        } catch (err) {
                            console.warn('Failed to open in new tab:', err);
                        }
                        return false;
                    }
                }, true);

                // 攔截所有鏈接點擊
                document.addEventListener('click', function(e) {
                    let target = e.target;
                    // 向上查找鏈接元素
                    while (target && target.tagName !== 'A' && target.tagName !== 'BODY' && target.tagName !== 'HTML') {
                        target = target.parentElement;
                    }
                    
                    if (target && target.tagName === 'A' && target.href) {
                        const href = target.href;
                        // 如果是有效的鏈接
                        if (href && !href.startsWith('javascript:') && !href.startsWith('#') && href !== 'about:blank') {
                            // 判斷是否在新標籤頁打開
                            const openInNewTab = target.target === '_blank' || e.ctrlKey || e.metaKey;
                            
                            // 阻止默認行為
                            e.preventDefault();
                            e.stopPropagation();
                            e.stopImmediatePropagation();
                            
                            // 使用 MiniBrowserAPI 發送消息（如果可用）
                            if (window.MiniBrowserAPI) {
                                try {
                                    if (openInNewTab) {
                                        window.MiniBrowserAPI.openInNewTab(href);
                                    } else {
                                        window.MiniBrowserAPI.navigateToUrl(href);
                                    }
                                } catch(err) {
                                    console.warn('Failed to use MiniBrowserAPI:', err);
                                    // 如果失敗，嘗試直接導航
                                    window.location.href = href;
                                }
                            } else if (window.require) {
                                try {
                                    const { ipcRenderer } = window.require('electron');
                                    if (openInNewTab) {
                                        ipcRenderer.sendToHost('open-in-new-tab', href);
                                    } else {
                                        ipcRenderer.sendToHost('navigate-to-url', href);
                                    }
                                } catch(err) {
                                    console.warn('Failed to send IPC message:', err);
                                    window.location.href = href;
                                }
                            } else {
                                // 如果都沒有，直接導航
                                window.location.href = href;
                            }
                            return false;
                        }
                    }
                }, true);
            })();
        `).catch(err => {
            console.warn('Failed to inject click handler:', err);
        });
    });

    // 兜底：若 webview 內部腳本未觸發，使用 webview 的 contextmenu 事件
    webview.addEventListener('contextmenu', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await toggleContextMenu();
    });


    webview.addEventListener('page-title-updated', (event) => {
        const tab = getActiveTab();
        if (tab) {
            tab.title = event.title;
            // 更新 breadcrumb 中目前頁面的顯示標題（只改最後一個符合 url 的按鈕）
            if (tab.breadcrumbButtons && tab.url) {
                for (let i = tab.breadcrumbButtons.length - 1; i >= 0; i--) {
                    if (tab.breadcrumbButtons[i].url === tab.url) {
                        tab.breadcrumbButtons[i].title = event.title;
                        break;
                    }
                }
            }
            renderTabs();
            renderPageBreadcrumb();
            
            // 在標題更新時，記錄到全域歷史（確保有正確的標題和 favicon）
            if (tab.url && !isHomePage(tab.url) && !isSettingsPage(tab.url) && !isPersonalCenterPage(tab.url)) {
                const incognitoMode = localStorage.getItem('incognito-mode') === 'true';
                if (!incognitoMode) {
                    // 檢查是否已經記錄過這個 URL（避免重複記錄）
                    const lastEntry = globalHistory[globalHistory.length - 1];
                    if (!lastEntry || lastEntry.url !== tab.url || lastEntry.tabId !== tab.id) {
                        appendGlobalHistory(tab.url);
                    } else {
                        // 如果已經記錄過，更新標題和 favicon
                        lastEntry.title = event.title;
                        lastEntry.favicon = tab.favicon;
                        if (sidebarMode === 'history') {
                            renderHistory();
                        }
                    }
                }
            }
        }
    });

    webview.addEventListener('page-favicon-updated', (event) => {
        const tab = getActiveTab();
        if (tab && event.favicons && event.favicons.length > 0) {
            tab.favicon = event.favicons[0];
            renderTabs();
            
            // 更新歷史記錄中的 favicon
            if (tab.url) {
                const lastEntry = globalHistory[globalHistory.length - 1];
                if (lastEntry && lastEntry.url === tab.url && lastEntry.tabId === tab.id) {
                    lastEntry.favicon = event.favicons[0];
                    if (sidebarMode === 'history') {
                        renderHistory();
                    }
                }
            }
        }
    });

    // -------- 右键菜单功能 --------
    let selectedText = '';
    let selectedUrl = ''; // 存储右键点击的元素 URL（链接、图片、视频等）
    let editableElement = null; // 存储右键点击的可编辑元素信息

    // 更新无痕模式按钮文本與個人中心圖示（無痕時改為 shield_person）
    function updateIncognitoButton() {
        const incognitoMode = localStorage.getItem('incognito-mode') === 'true';
        if (contextMenuIncognito) {
            const iconElement = contextMenuIncognito.querySelector('#context-menu-incognito-icon');
            const textElement = contextMenuIncognito.querySelector('#context-menu-incognito-text');
            
            if (iconElement) {
                iconElement.textContent = incognitoMode ? 'visibility' : 'visibility_off';
            }
            if (textElement) {
                textElement.textContent = incognitoMode ? '關閉無痕模式' : '開啟無痕模式';
            }
        }
        const personalCenterIcon = document.getElementById('personal-center-icon');
        if (personalCenterIcon) {
            personalCenterIcon.textContent = incognitoMode ? 'shield_person' : 'account_circle';
        }
    }

    // 检查剪贴板内容
    async function checkClipboardContent() {
        try {
            if (navigator.clipboard && navigator.clipboard.readText) {
                // 尝试聚焦文档以确保可以读取剪贴板
                if (document.activeElement !== document.body && !document.hasFocus()) {
                    window.focus();
                    // 等待一小段时间让焦点生效
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
                
                const text = await navigator.clipboard.readText();
                return text && text.length > 0;
            }
            // 降级方案：尝试读取剪贴板（可能不可用）
            return false;
        } catch (err) {
            // 如果无法读取剪贴板（例如文档未聚焦），默认返回 false（禁用粘贴按钮）
            // 不输出错误日志，因为这是正常情况
            return false;
        }
    }

    // 获取选中的文字（从 webview）
    function getSelectedText() {
        return new Promise((resolve) => {
            if (webview && !webview.isLoading()) {
                webview.executeJavaScript(`
                    (function() {
                        const selection = window.getSelection();
                        return selection.toString().trim();
                    })();
                `).then(text => {
                    resolve(text || '');
                }).catch(() => {
                    resolve('');
                });
            } else {
                resolve('');
            }
        });
    }

    // 检查菜单是否显示
    function isContextMenuVisible() {
        return contextMenu && contextMenu.classList.contains('show');
    }

    // 显示右键菜单（带数据）
    function showContextMenuWithData(hasSelection, hasUrl = false, isEditable = false, elementInfo = null) {
        if (!contextMenu) {
            console.error('Context menu element not found');
            return;
        }

        console.log('Showing context menu, hasSelection:', hasSelection, 'hasUrl:', hasUrl, 'isEditable:', isEditable);
        
        // 存储可编辑元素信息
        editableElement = isEditable ? elementInfo : null;

        // 检查是否可以返回上一页
        const canGoBack = canGoBackInActiveTab();

        // 设置按钮状态
        if (contextMenuBack) {
            if (canGoBack) {
                contextMenuBack.classList.remove('disabled');
            } else {
                contextMenuBack.classList.add('disabled');
            }
        }

        if (contextMenuCopy) {
            // 如果有选中文字或 URL，则启用复制按钮
            if (hasSelection || hasUrl) {
                contextMenuCopy.classList.remove('disabled');
            } else {
                contextMenuCopy.classList.add('disabled');
            }
        }

        if (contextMenuPaste) {
            // 如果有可编辑元素，检查剪贴板内容来决定是否启用
            if (editableElement) {
                // 异步检查剪贴板内容
                checkClipboardContent().then(hasContent => {
                    if (hasContent) {
                        contextMenuPaste.classList.remove('disabled');
                    } else {
                        contextMenuPaste.classList.add('disabled');
                    }
                });
            } else {
                contextMenuPaste.classList.add('disabled');
            }
        }

        if (contextMenuSearch) {
            // 如果有选中文字或 URL，则启用搜索与开启按钮
            if (hasSelection || hasUrl) {
                contextMenuSearch.classList.remove('disabled');
            } else {
                contextMenuSearch.classList.add('disabled');
            }
        }

        // 更新无痕模式按钮
        updateIncognitoButton();

        contextMenu.classList.add('show');
        console.log('Context menu shown');
    }

    // 显示右键菜单
    async function showContextMenu() {
        if (!contextMenu) return;

        // 获取选中的文字
        selectedText = await getSelectedText();
        const hasSelection = selectedText.length > 0;

        showContextMenuWithData(hasSelection);
    }

    // 隐藏右键菜单
    function hideContextMenu() {
        if (contextMenu) {
            contextMenu.classList.remove('show');
        }
        selectedText = '';
        selectedUrl = '';
    }

    // 切换右键菜单显示/隐藏
    async function toggleContextMenu() {
        const now = Date.now();
        if (now < contextMenuToggleLockUntil) return;
        contextMenuToggleLockUntil = now + 200;
        if (isContextMenuVisible()) {
            hideContextMenu();
        } else {
            await showContextMenu();
        }
    }

    // 获取元素 URL（链接、图片、视频等）
    function getElementUrl(element) {
        if (!element) return null;
        
        // 检查是否是链接
        if (element.tagName === 'A' && element.href) {
            return element.href;
        }
        
        // 检查是否是图片
        if (element.tagName === 'IMG' && element.src) {
            return element.src;
        }
        
        // 检查是否是视频
        if (element.tagName === 'VIDEO' && element.src) {
            return element.src;
        }
        
        // 检查父元素是否是链接
        const parentLink = element.closest('a');
        if (parentLink && parentLink.href) {
            return parentLink.href;
        }
        
        // 检查父元素是否是图片
        const parentImg = element.closest('img');
        if (parentImg && parentImg.src) {
            return parentImg.src;
        }
        
        // 检查父元素是否是视频
        const parentVideo = element.closest('video');
        if (parentVideo && parentVideo.src) {
            return parentVideo.src;
        }
        
        return null;
    }

    // 右键点击事件 - 使用 contextmenu 事件实现单击切换
    document.addEventListener('contextmenu', async (e) => {
        // 检查是否在 webview 容器内或 webview 上
        const target = e.target;
        const isInWebviewArea = webviewContainer && (
            webviewContainer.contains(target) || 
            target === webviewContainer || 
            target === webview || 
            (webview && webview.contains && webview.contains(target))
        );
        
        if (isInWebviewArea) {
            e.preventDefault();
            e.stopPropagation();
            
            // 尝试获取元素 URL（在主文档中，这通常不会工作，因为 webview 是独立的）
            // 主要依赖 webview 内部脚本获取
            selectedUrl = '';
            
            console.log('Right click detected, toggling context menu');
            await toggleContextMenu();
        }
    }, true);

    // 菜单按钮事件
    if (contextMenuBack) {
        contextMenuBack.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!contextMenuBack.classList.contains('disabled')) {
                goBackInActiveTab();
                hideContextMenu();
            }
        });
    }

    if (contextMenuCopy) {
        contextMenuCopy.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!contextMenuCopy.classList.contains('disabled')) {
                try {
                    // 优先复制 URL，如果没有 URL 则复制选中的文字
                    const textToCopy = selectedUrl || selectedText;
                    
                    if (textToCopy) {
                        // 使用 Clipboard API
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                            await navigator.clipboard.writeText(textToCopy);
                            console.log('Copied:', textToCopy);
                            // 添加到複製暫存
                            addToClipboardHistory(textToCopy);
                        } else {
                            // 降级方案
                            const textArea = document.createElement('textarea');
                            textArea.value = textToCopy;
                            textArea.style.position = 'fixed';
                            textArea.style.opacity = '0';
                            document.body.appendChild(textArea);
                            textArea.select();
                            document.execCommand('copy');
                            document.body.removeChild(textArea);
                            // 添加到複製暫存
                            addToClipboardHistory(textToCopy);
                        }
                    }
                } catch (err) {
                    console.error('复制失败:', err);
                }
                hideContextMenu();
            }
        });
    }

    if (contextMenuPaste) {
        contextMenuPaste.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!contextMenuPaste.classList.contains('disabled') && editableElement) {
                try {
                    let text = '';
                    if (navigator.clipboard && navigator.clipboard.readText) {
                        text = await navigator.clipboard.readText();
                    } else {
                        // 降级方案（可能不可用）
                        alert('粘贴功能需要 Clipboard API 支持');
                        hideContextMenu();
                        return;
                    }
                    
                    if (text) {
                        // 在 webview 中执行粘贴操作
                        if (webview && !webview.isLoading()) {
                            webview.executeJavaScript(`
                                (function() {
                                    const elementInfo = ${JSON.stringify(editableElement)};
                                    let targetElement = null;
                                    
                                    // 根据元素信息查找目标元素
                                    if (elementInfo.tagName) {
                                        if (elementInfo.id) {
                                            targetElement = document.getElementById(elementInfo.id);
                                        } else if (elementInfo.className) {
                                            const elements = document.getElementsByClassName(elementInfo.className);
                                            if (elements.length > 0) {
                                                targetElement = elements[0];
                                            }
                                        } else if (elementInfo.name) {
                                            targetElement = document.querySelector('[name="' + elementInfo.name + '"]');
                                        }
                                        
                                        // 如果找不到，尝试通过标签名和索引查找
                                        if (!targetElement && elementInfo.index !== undefined) {
                                            const elements = document.getElementsByTagName(elementInfo.tagName);
                                            if (elements[elementInfo.index]) {
                                                targetElement = elements[elementInfo.index];
                                            }
                                        }
                                    }
                                    
                                    if (targetElement) {
                                        // 设置值
                                        if (targetElement.tagName === 'INPUT' || targetElement.tagName === 'TEXTAREA') {
                                            targetElement.value = ${JSON.stringify(text)};
                                            // 触发 input 事件
                                            targetElement.dispatchEvent(new Event('input', { bubbles: true }));
                                            targetElement.dispatchEvent(new Event('change', { bubbles: true }));
                                            targetElement.focus();
                                        } else if (targetElement.isContentEditable) {
                                            targetElement.textContent = ${JSON.stringify(text)};
                                            targetElement.focus();
                                        }
                                        return true;
                                    }
                                    return false;
                                })();
                            `).then(success => {
                                if (!success) {
                                    console.warn('无法找到目标元素进行粘贴');
                                }
                            }).catch(err => {
                                console.error('粘贴操作失败:', err);
                            });
                        }
                    }
                } catch (err) {
                    console.error('粘贴失败:', err);
                }
                hideContextMenu();
            }
        });
    }

    if (contextMenuSearch) {
        contextMenuSearch.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!contextMenuSearch.classList.contains('disabled')) {
                // 如果有 URL，则在新标签页中打开该 URL
                if (selectedUrl) {
                    console.log('Opening URL in new tab:', selectedUrl);
                    createTab(selectedUrl, '新分頁');
                    hideContextMenu();
                }
                // 如果有选中文字，则执行搜索
                else if (selectedText) {
                    handleSearch(selectedText);
                    hideContextMenu();
                }
            }
        });
    }

    if (contextMenuIncognito) {
        contextMenuIncognito.addEventListener('click', (e) => {
            e.stopPropagation();
            const currentMode = localStorage.getItem('incognito-mode') === 'true';
            const newMode = !currentMode;
            localStorage.setItem('incognito-mode', newMode.toString());
            updateIncognitoButton();
            hideContextMenu();
        });
    }

    // 点击其他地方隐藏菜单（仅左键）
    document.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        // 如果点击的不是菜单本身，也不是菜单内的按钮，则隐藏菜单
        if (contextMenu && isContextMenuVisible()) {
            if (!contextMenu.contains(e.target)) {
                hideContextMenu();
            }
        }
    }, true);

    // -------- 初始化 --------
    loadSidebarWidth();
    loadSidebarPosition();
    loadPinnedTabs();
    // 從 localStorage 載入歷史紀錄（若存在）
    loadGlobalHistoryFromLocalStorage();

    // 啟動時先開啟所有釘選分頁（如果有）
    if (pinnedTabUrls.length > 0) {
        pinnedTabUrls.forEach((url) => {
            // 使用網址本身作為暫時標題，後續會由 page-title-updated 更新
            createTab(url, url);
        });
        // 再額外開一個首頁分頁
        createTab(getConfiguredHomeUrl(), '首頁');
    } else {
        // 沒有釘選分頁時，只開首頁
        createTab(getConfiguredHomeUrl(), '首頁');
    }
    renderSidebarView();
    // 若側邊欄為歷史模式，載入後立即渲染
    if (sidebarMode === 'history') {
        renderHistory();
    }
    updateNavButtons();
    updateAddressInput();
    updateIncognitoButton();
    
    // 監聽 webview 中的複製事件（通過注入腳本）
    if (webview) {
        webview.addEventListener('dom-ready', () => {
            // 注入腳本來監聽複製事件
            webview.executeJavaScript(`
                (function() {
                    let lastCopyTime = 0;
                    let lastCopyContent = '';
                    
                    // 監聽 copy 事件（這是主要的監聽方式）
                    document.addEventListener('copy', function(e) {
                        const selection = window.getSelection().toString();
                        if (selection && selection.trim()) {
                            const now = Date.now();
                            const trimmedSelection = selection.trim();
                            // 檢查是否在短時間內複製了相同內容（避免重複）
                            if (trimmedSelection !== lastCopyContent || now - lastCopyTime > 500) {
                                lastCopyTime = now;
                                lastCopyContent = trimmedSelection;
                                // 通過 IPC 發送複製內容到主進程
                                if (window.MiniBrowserAPI && window.MiniBrowserAPI.onCopy) {
                                    window.MiniBrowserAPI.onCopy(trimmedSelection);
                                }
                            }
                        }
                    });
                    
                    // 監聽鍵盤事件 Ctrl+C（作為備用，僅在 copy 事件未觸發時使用）
                    document.addEventListener('keydown', function(e) {
                        if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                            // 延遲讀取選中文字（給複製操作時間完成）
                            setTimeout(() => {
                                const selection = window.getSelection().toString();
                                if (selection && selection.trim()) {
                                    const now = Date.now();
                                    const trimmedSelection = selection.trim();
                                    // 檢查是否已經通過 copy 事件處理過（避免重複）
                                    // 如果 copy 事件已經處理過，lastCopyTime 會很新，這裡就不會再處理
                                    if (now - lastCopyTime > 500 || trimmedSelection !== lastCopyContent) {
                                        lastCopyTime = now;
                                        lastCopyContent = trimmedSelection;
                                        if (window.MiniBrowserAPI && window.MiniBrowserAPI.onCopy) {
                                            window.MiniBrowserAPI.onCopy(trimmedSelection);
                                        }
                                    }
                                }
                            }, 150);
                        }
                    });
                })();
            `).catch(err => console.log('無法注入複製監聽腳本:', err));
        });
    }
});
