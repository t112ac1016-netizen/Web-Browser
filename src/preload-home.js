const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("MiniBrowserAPI", {
    search(query) {
        ipcRenderer.sendToHost("search", query);
    },
    openSettings() {
        ipcRenderer.sendToHost("open-settings");
    },
    openInNewTab(url) {
        ipcRenderer.sendToHost("open-in-new-tab", url);
    },
    navigateToUrl(url) {
        ipcRenderer.sendToHost("navigate-to-url", url);
    },
    updateSidebarPosition(position) {
        ipcRenderer.sendToHost("sidebar-position-changed", position);
    },
    showContextMenu(data) {
        ipcRenderer.sendToHost("show-context-menu", data);
    },
    onCopy(content) {
        ipcRenderer.sendToHost("copy-content", content);
    },
    openDownloads() {
        ipcRenderer.sendToHost("open-downloads");
    },
    /** 向宿主請求最新歷史與書籤資料（個人中心頁） */
    refreshPersonalCenter() {
        ipcRenderer.sendToHost("request-personal-center-data");
    },
    /** 刪除一筆全域歷史（url + timestamp + tabId 需與宿主一致） */
    deleteHistoryEntry(entry) {
        ipcRenderer.sendToHost("delete-history-entry", entry);
    }
});
