window.addEventListener("DOMContentLoaded", () => {
    const select = document.getElementById("engine-select");
    const siteList = document.getElementById("site-list");
    const newSiteInput = document.getElementById("new-site-input");
    const addSiteBtn = document.getElementById("add-site-btn");
    const startupHomeUrlInput = document.getElementById("startup-home-url-input");
    const pinnedBookmarksDisplayToggle = document.getElementById("pinned-bookmarks-display-toggle");

    // 載入現有設定
    const saved = localStorage.getItem("search-engine") || "google";
    select.value = saved;

    // 變更設定
    select.addEventListener("change", () => {
        localStorage.setItem("search-engine", select.value);
    });

    // 載入網站清單
    function loadSiteList() {
        const sites = JSON.parse(localStorage.getItem("search-sites") || "[]");
        siteList.innerHTML = "";
        
        sites.forEach((site, index) => {
            const li = document.createElement("li");
            li.className = "site-item";
            
            const input = document.createElement("input");
            input.type = "text";
            input.value = site;
            input.addEventListener("blur", () => {
                updateSite(index, input.value.trim());
            });
            input.addEventListener("keypress", (e) => {
                if (e.key === "Enter") {
                    input.blur();
                }
            });
            
            const deleteBtn = document.createElement("button");
            deleteBtn.textContent = "刪除";
            deleteBtn.addEventListener("click", () => {
                deleteSite(index);
            });
            
            li.appendChild(input);
            li.appendChild(deleteBtn);
            siteList.appendChild(li);
        });
    }

    // 更新網站
    function updateSite(index, value) {
        if (!value) {
            deleteSite(index);
            return;
        }
        const sites = JSON.parse(localStorage.getItem("search-sites") || "[]");
        sites[index] = value;
        localStorage.setItem("search-sites", JSON.stringify(sites));
        loadSiteList();
    }

    // 刪除網站
    function deleteSite(index) {
        const sites = JSON.parse(localStorage.getItem("search-sites") || "[]");
        sites.splice(index, 1);
        localStorage.setItem("search-sites", JSON.stringify(sites));
        loadSiteList();
    }

    // 新增網站
    function addSite() {
        const value = newSiteInput.value.trim();
        if (!value) return;
        
        const sites = JSON.parse(localStorage.getItem("search-sites") || "[]");
        if (sites.includes(value)) {
            alert("此網址已存在於清單中");
            return;
        }
        sites.push(value);
        localStorage.setItem("search-sites", JSON.stringify(sites));
        newSiteInput.value = "";
        loadSiteList();
    }

    addSiteBtn.addEventListener("click", addSite);
    newSiteInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            addSite();
        }
    });

    // 側邊欄位置設定
    const sidebarPositionSelect = document.getElementById("sidebar-position-select");
    
    // 載入現有設定
    const savedPosition = localStorage.getItem("sidebar-position") || "left";
    sidebarPositionSelect.value = savedPosition;
    
    // 變更設定
    sidebarPositionSelect.addEventListener("change", () => {
        const position = sidebarPositionSelect.value;
        localStorage.setItem("sidebar-position", position);
        
        // 通知主窗口側邊欄位置變更
        if (window.MiniBrowserAPI && window.MiniBrowserAPI.updateSidebarPosition) {
            window.MiniBrowserAPI.updateSidebarPosition(position);
        }
    });

    // 初始化
    loadSiteList();
    if (startupHomeUrlInput) {
        startupHomeUrlInput.value = localStorage.getItem("startup-home-url") || "";
        startupHomeUrlInput.addEventListener("change", () => {
            localStorage.setItem("startup-home-url", startupHomeUrlInput.value.trim());
        });
    }
    if (pinnedBookmarksDisplayToggle) {
        pinnedBookmarksDisplayToggle.checked = localStorage.getItem("pinned-bookmarks-display") === "true";
        pinnedBookmarksDisplayToggle.addEventListener("change", () => {
            localStorage.setItem("pinned-bookmarks-display", pinnedBookmarksDisplayToggle.checked ? "true" : "false");
        });
    }
});
