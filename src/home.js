window.addEventListener("DOMContentLoaded", () => {
    const searchBox = document.getElementById("search-box");
    const searchBtn = document.getElementById("search-btn");
    const engineDropdownBtn = document.getElementById("engine-dropdown-btn");
    const engineDropdownMenu = document.getElementById("engine-dropdown-menu");
    const engineDropdownContainer = document.getElementById("engine-dropdown-container");
    const engineOptions = document.querySelectorAll(".engine-option");
    const siteButtonsContainer = document.getElementById("site-buttons-container");
    const pinnedSearchContainer = document.getElementById("pinned-search-container");
    const pinnedButtonsContainer = document.getElementById("pinned-buttons-container");
    
    // 搜索词钉选功能相关元素
    const pinSearchModal = document.getElementById("pin-search-modal");
    const pinSearchInput = document.getElementById("pin-search-input");
    const pinSearchCancelBtn = document.getElementById("pin-search-cancel-btn");
    const pinSearchConfirmBtn = document.getElementById("pin-search-confirm-btn");
    
    // 网址钉选功能相关元素
    const pinModal = document.getElementById("pin-modal");
    const pinNameInput = document.getElementById("pin-name-input");
    const pinUrlInput = document.getElementById("pin-url-input");
    const pinCancelBtn = document.getElementById("pin-cancel-btn");
    const pinConfirmBtn = document.getElementById("pin-confirm-btn");

    // 獲取搜索引擎名稱
    function getEngineName(value) {
        const names = {
            'google': 'Google',
            'bing': 'Bing',
            'duck': 'DuckDuckGo'
        };
        return names[value] || 'Google';
    }

    // 載入並更新當前搜索引擎顯示
    function updateEngineDisplay() {
        const saved = localStorage.getItem("search-engine") || "google";
        engineDropdownBtn.textContent = getEngineName(saved);
        
        // 更新選中狀態
        engineOptions.forEach(option => {
            if (option.dataset.engine === saved) {
                option.classList.add('active');
            } else {
                option.classList.remove('active');
            }
        });
    }

    // 執行搜索
    function performSearch(query = null) {
        const searchQuery = query || searchBox.value.trim();
        if (searchQuery) {
            window.MiniBrowserAPI.search(searchQuery);
        }
    }

    // 執行網站搜索
    function performSiteSearch(site) {
        const query = searchBox.value.trim();
        if (query) {
            const siteQuery = `${query} site:${site}`;
            performSearch(siteQuery);
        }
    }

    // 更新網站按鈕顯示
    function updateSiteButtons() {
        const sites = JSON.parse(localStorage.getItem("search-sites") || "[]");
        const query = searchBox.value.trim();
        siteButtonsContainer.innerHTML = "";
        
        // 如果沒有網站清單或搜索框為空，隱藏按鈕
        if (sites.length === 0 || !query) {
            siteButtonsContainer.style.display = "none";
            return;
        }
        
        siteButtonsContainer.style.display = "flex";
        sites.forEach(site => {
            const button = document.createElement("button");
            button.className = "site-button";
            button.textContent = site;
            button.addEventListener("click", () => {
                performSiteSearch(site);
            });
            siteButtonsContainer.appendChild(button);
        });
    }

    // 搜索按鈕點擊
    searchBtn.addEventListener("click", () => {
        performSearch();
    });

    // Enter 鍵搜索
    searchBox.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            performSearch();
        }
    });

    // 下拉菜單按鈕點擊
    engineDropdownBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        engineDropdownMenu.classList.toggle("show");
    });

    // 選擇搜索引擎
    engineOptions.forEach(option => {
        option.addEventListener("click", (e) => {
            e.stopPropagation();
            const engine = option.dataset.engine;
            localStorage.setItem("search-engine", engine);
            updateEngineDisplay();
            engineDropdownMenu.classList.remove("show");
        });
    });

    // 點擊外部關閉下拉菜單
    document.addEventListener("click", (e) => {
        if (!engineDropdownContainer.contains(e.target)) {
            engineDropdownMenu.classList.remove("show");
        }
    });

    // 載入釘選搜尋詞
    function loadPinnedSearches() {
        return JSON.parse(localStorage.getItem("pinned-searches") || "[]");
    }

    // 保存釘選搜尋詞
    function savePinnedSearches(searches) {
        localStorage.setItem("pinned-searches", JSON.stringify(searches));
    }

    // 渲染釘選搜尋詞按鈕
    function renderPinnedSearchButtons() {
        pinnedSearchContainer.innerHTML = "";
        const pinnedSearches = loadPinnedSearches();
        
        // 渲染已保存的搜索词按钮
        pinnedSearches.forEach((searchTerm, index) => {
            const wrapper = document.createElement("div");
            wrapper.className = "pinned-button-wrapper";
            
            const button = document.createElement("button");
            button.className = "pinned-search-button";
            button.textContent = searchTerm;
            button.addEventListener("click", (e) => {
                // 如果点击的是菜单按钮，不执行搜索
                if (e.target.closest('.pinned-button-menu-btn')) {
                    return;
                }
                // 执行搜索
                if (window.MiniBrowserAPI && window.MiniBrowserAPI.search) {
                    window.MiniBrowserAPI.search(searchTerm);
                }
            });
            
            const menuBtn = document.createElement("button");
            menuBtn.className = "pinned-button-menu-btn";
            menuBtn.innerHTML = "⋮";
            menuBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                openEditPinSearchModal(index, searchTerm);
            });
            
            wrapper.appendChild(button);
            wrapper.appendChild(menuBtn);
            pinnedSearchContainer.appendChild(wrapper);
        });
        
        // 添加 + 按钮（始终存在）
        const addButton = document.createElement("button");
        addButton.className = "add-pinned-search-button";
        addButton.innerHTML = `<span class="material-symbols-outlined pinned-add-icon">add_2</span>`;
        addButton.addEventListener("click", () => {
            openPinSearchModal();
        });
        pinnedSearchContainer.appendChild(addButton);
    }

    // 当前编辑的搜索词索引（null 表示新增）
    let editingSearchIndex = null;
    
    // 打开搜索词钉选对话框
    function openPinSearchModal() {
        editingSearchIndex = null;
        pinSearchInput.value = "";
        document.getElementById("pin-search-modal-title").textContent = "新增釘選搜尋詞";
        const buttons = document.getElementById("pin-search-modal-buttons");
        buttons.className = "modal-buttons";
        buttons.innerHTML = `
            <button class="modal-button modal-button-cancel" id="pin-search-cancel-btn">取消</button>
            <button class="modal-button modal-button-confirm" id="pin-search-confirm-btn">確定</button>
        `;
        // 重新绑定事件
        document.getElementById("pin-search-cancel-btn").addEventListener("click", closePinSearchModal);
        document.getElementById("pin-search-confirm-btn").addEventListener("click", confirmPinSearch);
        pinSearchModal.classList.add("show");
        pinSearchInput.focus();
    }
    
    // 打开编辑搜索词对话框
    function openEditPinSearchModal(index, searchTerm) {
        editingSearchIndex = index;
        pinSearchInput.value = searchTerm;
        document.getElementById("pin-search-modal-title").textContent = "編輯釘選搜尋詞";
        const buttons = document.getElementById("pin-search-modal-buttons");
        buttons.className = "modal-buttons three-buttons";
        buttons.innerHTML = `
            <button class="modal-button modal-button-delete" id="pin-search-delete-btn">刪除</button>
            <button class="modal-button modal-button-cancel" id="pin-search-cancel-btn">取消</button>
            <button class="modal-button modal-button-confirm" id="pin-search-confirm-btn">確定</button>
        `;
        // 重新绑定事件
        document.getElementById("pin-search-delete-btn").addEventListener("click", deletePinSearch);
        document.getElementById("pin-search-cancel-btn").addEventListener("click", closePinSearchModal);
        document.getElementById("pin-search-confirm-btn").addEventListener("click", confirmPinSearch);
        pinSearchModal.classList.add("show");
        pinSearchInput.focus();
    }
    
    // 删除搜索词
    function deletePinSearch() {
        if (editingSearchIndex === null) return;
        
        const pinnedSearches = loadPinnedSearches();
        pinnedSearches.splice(editingSearchIndex, 1);
        savePinnedSearches(pinnedSearches);
        
        renderPinnedSearchButtons();
        closePinSearchModal();
    }

    // 关闭搜索词钉选对话框
    function closePinSearchModal() {
        pinSearchModal.classList.remove("show");
    }

    // 确认添加或编辑钉选搜索词
    function confirmPinSearch() {
        const searchTerm = pinSearchInput.value.trim();
        
        if (!searchTerm) {
            alert("請輸入搜尋詞");
            return;
        }
        
        const pinnedSearches = loadPinnedSearches();
        
        if (editingSearchIndex !== null) {
            // 编辑模式
            pinnedSearches[editingSearchIndex] = searchTerm;
        } else {
            // 新增模式
            pinnedSearches.push(searchTerm);
        }
        
        savePinnedSearches(pinnedSearches);
        
        // 重新渲染按钮
        renderPinnedSearchButtons();
        
        // 关闭对话框
        closePinSearchModal();
    }

    // 搜索词钉选对话框事件
    pinSearchCancelBtn.addEventListener("click", closePinSearchModal);
    pinSearchConfirmBtn.addEventListener("click", confirmPinSearch);
    
    // 点击搜索词对话框外部关闭
    pinSearchModal.addEventListener("click", (e) => {
        if (e.target === pinSearchModal) {
            closePinSearchModal();
        }
    });
    
    // 搜索词输入框 Enter 键确认
    pinSearchInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            confirmPinSearch();
        }
    });

    // 載入釘選網址
    function loadPinnedUrls() {
        return JSON.parse(localStorage.getItem("pinned-urls") || "[]");
    }

    // 保存釘選網址
    function savePinnedUrls(urls) {
        localStorage.setItem("pinned-urls", JSON.stringify(urls));
    }

    // 渲染釘選按鈕
    function renderPinnedButtons() {
        pinnedButtonsContainer.innerHTML = "";
        const pinnedUrls = loadPinnedUrls();
        
        // 渲染已保存的按钮
        pinnedUrls.forEach((item, index) => {
            const wrapper = document.createElement("div");
            wrapper.className = "pinned-button-wrapper";
            
            const button = document.createElement("button");
            button.className = "pinned-button";
            button.textContent = item.name;
            button.addEventListener("click", (e) => {
                // 如果点击的是菜单按钮，不执行导航
                if (e.target.closest('.pinned-button-menu-btn')) {
                    return;
                }
                // 导航到网址
                if (window.MiniBrowserAPI && window.MiniBrowserAPI.navigateToUrl) {
                    window.MiniBrowserAPI.navigateToUrl(item.url);
                } else if (window.MiniBrowserAPI && window.MiniBrowserAPI.search) {
                    // 如果没有 navigateToUrl，使用 search 方法（会处理 URL）
                    window.MiniBrowserAPI.search(item.url);
                } else {
                    window.location.href = item.url;
                }
            });
            
            const menuBtn = document.createElement("button");
            menuBtn.className = "pinned-button-menu-btn";
            menuBtn.innerHTML = "⋮";
            menuBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                openEditPinModal(index, item.name, item.url);
            });
            
            wrapper.appendChild(button);
            wrapper.appendChild(menuBtn);
            pinnedButtonsContainer.appendChild(wrapper);
        });
        
        // 添加 + 按钮（始终存在）
        const addButton = document.createElement("button");
        addButton.className = "add-pinned-button";
        addButton.innerHTML = `<span class="material-symbols-outlined pinned-add-icon">add_2</span>`;
        addButton.addEventListener("click", () => {
            openPinModal();
        });
        pinnedButtonsContainer.appendChild(addButton);
    }

    // 当前编辑的网址索引（null 表示新增）
    let editingUrlIndex = null;
    
    // 打开钉选对话框
    function openPinModal() {
        editingUrlIndex = null;
        pinNameInput.value = "";
        pinUrlInput.value = "";
        document.getElementById("pin-modal-title").textContent = "新增釘選網址";
        const buttons = document.getElementById("pin-modal-buttons");
        buttons.className = "modal-buttons";
        buttons.innerHTML = `
            <button class="modal-button modal-button-cancel" id="pin-cancel-btn">取消</button>
            <button class="modal-button modal-button-confirm" id="pin-confirm-btn">確定</button>
        `;
        // 重新绑定事件
        document.getElementById("pin-cancel-btn").addEventListener("click", closePinModal);
        document.getElementById("pin-confirm-btn").addEventListener("click", confirmPin);
        pinModal.classList.add("show");
        pinNameInput.focus();
    }
    
    // 打开编辑网址对话框
    function openEditPinModal(index, name, url) {
        editingUrlIndex = index;
        pinNameInput.value = name;
        pinUrlInput.value = url;
        document.getElementById("pin-modal-title").textContent = "編輯釘選網址";
        const buttons = document.getElementById("pin-modal-buttons");
        buttons.className = "modal-buttons three-buttons";
        buttons.innerHTML = `
            <button class="modal-button modal-button-delete" id="pin-delete-btn">刪除</button>
            <button class="modal-button modal-button-cancel" id="pin-cancel-btn">取消</button>
            <button class="modal-button modal-button-confirm" id="pin-confirm-btn">確定</button>
        `;
        // 重新绑定事件
        document.getElementById("pin-delete-btn").addEventListener("click", deletePin);
        document.getElementById("pin-cancel-btn").addEventListener("click", closePinModal);
        document.getElementById("pin-confirm-btn").addEventListener("click", confirmPin);
        pinModal.classList.add("show");
        pinNameInput.focus();
    }
    
    // 删除网址
    function deletePin() {
        if (editingUrlIndex === null) return;
        
        const pinnedUrls = loadPinnedUrls();
        pinnedUrls.splice(editingUrlIndex, 1);
        savePinnedUrls(pinnedUrls);
        
        renderPinnedButtons();
        closePinModal();
    }

    // 关闭钉选对话框
    function closePinModal() {
        pinModal.classList.remove("show");
    }

    // 确认添加或编辑钉选网址
    function confirmPin() {
        const name = pinNameInput.value.trim();
        const url = pinUrlInput.value.trim();
        
        if (!name || !url) {
            alert("請填寫按鈕名稱和網址");
            return;
        }
        
        // 处理 URL 格式
        let finalUrl = url;
        if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://") && !finalUrl.startsWith("./") && !finalUrl.startsWith("file://")) {
            finalUrl = "https://" + finalUrl;
        }
        
        const pinnedUrls = loadPinnedUrls();
        
        if (editingUrlIndex !== null) {
            // 编辑模式
            pinnedUrls[editingUrlIndex] = { name, url: finalUrl };
        } else {
            // 新增模式
            pinnedUrls.push({ name, url: finalUrl });
        }
        
        savePinnedUrls(pinnedUrls);
        
        // 重新渲染按钮
        renderPinnedButtons();
        
        // 关闭对话框
        closePinModal();
    }

    // 点击对话框外部关闭
    pinModal.addEventListener("click", (e) => {
        if (e.target === pinModal) {
            closePinModal();
        }
    });
    
    // Enter 键确认（使用事件委托，因为按钮是动态创建的）
    document.addEventListener("keypress", (e) => {
        if (pinModal.classList.contains("show")) {
            if (e.target === pinNameInput && e.key === "Enter") {
                pinUrlInput.focus();
            } else if (e.target === pinUrlInput && e.key === "Enter") {
                confirmPin();
            }
        }
        if (pinSearchModal.classList.contains("show")) {
            if (e.target === pinSearchInput && e.key === "Enter") {
                confirmPinSearch();
            }
        }
    });

    // 初始化顯示
    updateEngineDisplay();
    updateSiteButtons();
    renderPinnedSearchButtons();
    renderPinnedButtons();
    
    // 監聽搜索框輸入，顯示網站按鈕
    searchBox.addEventListener("input", () => {
        updateSiteButtons();
    });
});
