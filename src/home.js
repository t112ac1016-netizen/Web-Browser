window.addEventListener("DOMContentLoaded", () => {
    const searchBox = document.getElementById("search-box");
    const searchBtn = document.getElementById("search-btn");
    const engineDropdownBtn = document.getElementById("engine-dropdown-btn");
    const engineDropdownMenu = document.getElementById("engine-dropdown-menu");
    const engineDropdownContainer = document.getElementById("engine-dropdown-container");
    const engineOptions = document.querySelectorAll(".engine-option");
    const recentSearchMenu = document.getElementById("recent-search-menu");
    const siteButtonsContainer = document.getElementById("site-buttons-container");
    const pinnedSearchContainer = document.getElementById("pinned-search-container");
    const pinnedButtonsContainer = document.getElementById("pinned-buttons-container");
    const RECENT_SEARCHES_KEY = "recent-searches";
    const RECENT_SEARCHES_MAX = 12;
    
    const pinSearchModal = document.getElementById("pin-search-modal");
    const pinSearchInput = document.getElementById("pin-search-input");
    const pinSearchCancelBtn = document.getElementById("pin-search-cancel-btn");
    const pinSearchConfirmBtn = document.getElementById("pin-search-confirm-btn");
    
    const pinModal = document.getElementById("pin-modal");
    const pinNameInput = document.getElementById("pin-name-input");
    const pinUrlInput = document.getElementById("pin-url-input");
    const pinCancelBtn = document.getElementById("pin-cancel-btn");
    const pinConfirmBtn = document.getElementById("pin-confirm-btn");

    // 取得搜尋引擎名稱
    function getEngineName(value) {
        const names = {
            'google': 'Google',
            'bing': 'Bing',
            'duck': 'DuckDuckGo'
        };
        return names[value] || 'Google';
    }

    function updateEngineDisplay() {
        const saved = localStorage.getItem("search-engine") || "google";
        engineDropdownBtn.textContent = getEngineName(saved);
        
        engineOptions.forEach(option => {
            if (option.dataset.engine === saved) {
                option.classList.add('active');
            } else {
                option.classList.remove('active');
            }
        });
    }

    // 執行搜尋
    function performSearch(query = null) {
        const searchQuery = query || searchBox.value.trim();
        if (searchQuery) {
            addRecentSearch(searchQuery);
            window.MiniBrowserAPI.search(searchQuery);
        }
    }

    function loadRecentSearches() {
        try {
            const items = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || "[]");
            if (!Array.isArray(items)) return [];
            return items.filter(item => typeof item === "string" && item.trim());
        } catch (e) {
            return [];
        }
    }

    function saveRecentSearches(items) {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(items));
    }

    function addRecentSearch(term) {
        const value = term.trim();
        if (!value) return;
        let items = loadRecentSearches().filter(item => item !== value);
        items.unshift(value);
        if (items.length > RECENT_SEARCHES_MAX) {
            items = items.slice(0, RECENT_SEARCHES_MAX);
        }
        saveRecentSearches(items);
    }

    function removeRecentSearch(term) {
        const value = term.trim();
        if (!value) return;
        const items = loadRecentSearches().filter(item => item !== value);
        saveRecentSearches(items);
    }

    function hideRecentSearchMenu() {
        recentSearchMenu.classList.remove("show");
    }

    function buildSiteButtonsSection() {
        const sites = JSON.parse(localStorage.getItem("search-sites") || "[]");
        const query = searchBox.value.trim();
        if (sites.length === 0 || !query) return null;

        const section = document.createElement("div");
        section.className = "recent-site-buttons";
        sites.forEach(site => {
            const button = document.createElement("button");
            button.className = "site-button";
            button.type = "button";
            button.textContent = site;
            button.addEventListener("click", () => {
                hideRecentSearchMenu();
                performSiteSearch(site);
            });
            section.appendChild(button);
        });
        return section;
    }

    function renderRecentSearchMenu(query) {
        const q = query.trim().toLowerCase();
        const items = q
            ? loadRecentSearches().filter(item => item.toLowerCase().includes(q))
            : loadRecentSearches();
        recentSearchMenu.innerHTML = "";
        let hasContent = false;

        const siteButtonsSection = buildSiteButtonsSection();
        if (siteButtonsSection) {
            recentSearchMenu.appendChild(siteButtonsSection);
            hasContent = true;
        }

        items.forEach(item => {
            const row = document.createElement("div");
            row.className = "recent-search-item";

            const button = document.createElement("button");
            button.className = "recent-search-text";
            button.type = "button";
            button.textContent = item;
            button.addEventListener("click", () => {
                searchBox.value = item;
                hideRecentSearchMenu();
                performSearch(item);
            });

            const deleteBtn = document.createElement("button");
            deleteBtn.className = "recent-search-delete";
            deleteBtn.type = "button";
            deleteBtn.textContent = "x";
            deleteBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                removeRecentSearch(item);
                renderRecentSearchMenu(searchBox.value);
            });

            row.appendChild(button);
            row.appendChild(deleteBtn);
            recentSearchMenu.appendChild(row);
            hasContent = true;
        });

        if (!hasContent) {
            hideRecentSearchMenu();
            return;
        }
        recentSearchMenu.classList.add("show");
    }

    // 執行網站限定搜尋
    function performSiteSearch(site) {
        const query = searchBox.value.trim();
        if (query) {
            const siteQuery = `${query} site:${site}`;
            performSearch(siteQuery);
        }
    }

    // 舊的 site 按鈕容器已停用（改顯示於最近搜尋選單上方）
    function updateSiteButtons() {
        siteButtonsContainer.innerHTML = "";
        siteButtonsContainer.style.display = "none";
    }

    // 搜尋按鈕點擊
    searchBtn.addEventListener("click", () => {
        hideRecentSearchMenu();
        performSearch();
    });

    searchBox.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            hideRecentSearchMenu();
            performSearch();
        }
    });
    searchBox.addEventListener("focus", () => {
        renderRecentSearchMenu(searchBox.value);
    });

    // 搜尋引擎下拉按鈕
    engineDropdownBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        engineDropdownMenu.classList.toggle("show");
    });

    // 選擇搜尋引擎
    engineOptions.forEach(option => {
        option.addEventListener("click", (e) => {
            e.stopPropagation();
            const engine = option.dataset.engine;
            localStorage.setItem("search-engine", engine);
            updateEngineDisplay();
            engineDropdownMenu.classList.remove("show");
        });
    });

    // 點擊外部關閉下拉與最近搜尋選單
    document.addEventListener("click", (e) => {
        if (!engineDropdownContainer.contains(e.target)) {
            engineDropdownMenu.classList.remove("show");
        }
        if (!e.target.closest("#search-container")) {
            hideRecentSearchMenu();
        }
    });

    function loadPinnedSearches() {
        return JSON.parse(localStorage.getItem("pinned-searches") || "[]");
    }

    function savePinnedSearches(searches) {
        localStorage.setItem("pinned-searches", JSON.stringify(searches));
    }

    function renderPinnedSearchButtons() {
        pinnedSearchContainer.innerHTML = "";
        const pinnedSearches = loadPinnedSearches();
        
        pinnedSearches.forEach((searchTerm, index) => {
            const wrapper = document.createElement("div");
            wrapper.className = "pinned-button-wrapper";
            
            const button = document.createElement("button");
            button.className = "pinned-search-button";
            button.textContent = searchTerm;
            button.addEventListener("click", (e) => {
                // 如果點到選單按鈕，不執行搜尋
                if (e.target.closest('.pinned-button-menu-btn')) {
                    return;
                }
                // 執行搜尋
                if (window.MiniBrowserAPI && window.MiniBrowserAPI.search) {
                    window.MiniBrowserAPI.search(searchTerm);
                }
            });
            
            const menuBtn = document.createElement("button");
            menuBtn.className = "pinned-button-menu-btn";
            menuBtn.innerHTML = "&#8942;";
            menuBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                openEditPinSearchModal(index, searchTerm);
            });
            
            wrapper.appendChild(button);
            wrapper.appendChild(menuBtn);
            pinnedSearchContainer.appendChild(wrapper);
        });
        
        // 新增按鈕（固定顯示）
        const addButton = document.createElement("button");
        addButton.className = "add-pinned-search-button";
        addButton.innerHTML = `<span class="material-symbols-outlined pinned-add-icon">add_2</span>`;
        addButton.addEventListener("click", () => {
            openPinSearchModal();
        });
        pinnedSearchContainer.appendChild(addButton);
    }

    let editingSearchIndex = null;
    
    // 開啟新增釘選搜尋詞視窗
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
        // 重新綁定事件
        document.getElementById("pin-search-cancel-btn").addEventListener("click", closePinSearchModal);
        document.getElementById("pin-search-confirm-btn").addEventListener("click", confirmPinSearch);
        pinSearchModal.classList.add("show");
        pinSearchInput.focus();
    }
    
    // 開啟編輯釘選搜尋詞視窗
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
        // 重新綁定事件
        document.getElementById("pin-search-delete-btn").addEventListener("click", deletePinSearch);
        document.getElementById("pin-search-cancel-btn").addEventListener("click", closePinSearchModal);
        document.getElementById("pin-search-confirm-btn").addEventListener("click", confirmPinSearch);
        pinSearchModal.classList.add("show");
        pinSearchInput.focus();
    }
    
    function deletePinSearch() {
        if (editingSearchIndex === null) return;
        
        const pinnedSearches = loadPinnedSearches();
        pinnedSearches.splice(editingSearchIndex, 1);
        savePinnedSearches(pinnedSearches);
        
        renderPinnedSearchButtons();
        closePinSearchModal();
    }

    // 關閉釘選搜尋詞視窗
    function closePinSearchModal() {
        pinSearchModal.classList.remove("show");
    }

    // 確認新增或編輯釘選搜尋詞
    function confirmPinSearch() {
        const searchTerm = pinSearchInput.value.trim();
        
        if (!searchTerm) {
            alert("請輸入搜尋詞");
            return;
        }
        
        const pinnedSearches = loadPinnedSearches();
        
        if (editingSearchIndex !== null) {
            // 編輯模式
            pinnedSearches[editingSearchIndex] = searchTerm;
        } else {
            // 新增模式
            pinnedSearches.push(searchTerm);
        }
        
        savePinnedSearches(pinnedSearches);
        
        // 重新渲染按鈕
        renderPinnedSearchButtons();
        
        closePinSearchModal();
    }

    // 視窗按鈕事件
    pinSearchCancelBtn.addEventListener("click", closePinSearchModal);
    pinSearchConfirmBtn.addEventListener("click", confirmPinSearch);
    
    // 點擊視窗外部關閉
    pinSearchModal.addEventListener("click", (e) => {
        if (e.target === pinSearchModal) {
            closePinSearchModal();
        }
    });
    
    pinSearchInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            confirmPinSearch();
        }
    });

    // 載入釘選網址
    function loadPinnedUrls() {
        return JSON.parse(localStorage.getItem("pinned-urls") || "[]");
    }

    // 儲存釘選網址
    function savePinnedUrls(urls) {
        localStorage.setItem("pinned-urls", JSON.stringify(urls));
    }

    // 渲染釘選網址按鈕
    function renderPinnedButtons() {
        pinnedButtonsContainer.innerHTML = "";
        const pinnedUrls = loadPinnedUrls();
        
        // 渲染已保存的按鈕
        pinnedUrls.forEach((item, index) => {
            const wrapper = document.createElement("div");
            wrapper.className = "pinned-button-wrapper";
            
            const button = document.createElement("button");
            button.className = "pinned-button";
            button.textContent = item.name;
            button.addEventListener("click", (e) => {
                // 如果點到選單按鈕，不執行導航
                if (e.target.closest('.pinned-button-menu-btn')) {
                    return;
                }
                // 導航到網址
                if (window.MiniBrowserAPI && window.MiniBrowserAPI.navigateToUrl) {
                    window.MiniBrowserAPI.navigateToUrl(item.url);
                } else if (window.MiniBrowserAPI && window.MiniBrowserAPI.search) {
                    window.MiniBrowserAPI.search(item.url);
                } else {
                    window.location.href = item.url;
                }
            });
            
            const menuBtn = document.createElement("button");
            menuBtn.className = "pinned-button-menu-btn";
            menuBtn.innerHTML = "&#8942;";
            menuBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                openEditPinModal(index, item.name, item.url);
            });
            
            wrapper.appendChild(button);
            wrapper.appendChild(menuBtn);
            pinnedButtonsContainer.appendChild(wrapper);
        });
        
        // 新增按鈕（固定顯示）
        const addButton = document.createElement("button");
        addButton.className = "add-pinned-button";
        addButton.innerHTML = `<span class="material-symbols-outlined pinned-add-icon">add_2</span>`;
        addButton.addEventListener("click", () => {
            openPinModal();
        });
        pinnedButtonsContainer.appendChild(addButton);
    }

    let editingUrlIndex = null;
    
    // 開啟新增釘選網址視窗
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
        // 重新綁定事件
        document.getElementById("pin-cancel-btn").addEventListener("click", closePinModal);
        document.getElementById("pin-confirm-btn").addEventListener("click", confirmPin);
        pinModal.classList.add("show");
        pinNameInput.focus();
    }
    
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
        // 重新綁定事件
        document.getElementById("pin-delete-btn").addEventListener("click", deletePin);
        document.getElementById("pin-cancel-btn").addEventListener("click", closePinModal);
        document.getElementById("pin-confirm-btn").addEventListener("click", confirmPin);
        pinModal.classList.add("show");
        pinNameInput.focus();
    }
    
    // 刪除釘選網址
    function deletePin() {
        if (editingUrlIndex === null) return;
        
        const pinnedUrls = loadPinnedUrls();
        pinnedUrls.splice(editingUrlIndex, 1);
        savePinnedUrls(pinnedUrls);
        
        renderPinnedButtons();
        closePinModal();
    }

    // 關閉釘選網址視窗
    function closePinModal() {
        pinModal.classList.remove("show");
    }

    // 確認新增或編輯釘選網址
    function confirmPin() {
        const name = pinNameInput.value.trim();
        const url = pinUrlInput.value.trim();
        
        if (!name || !url) {
            alert("請輸入按鈕名稱與網址");
            return;
        }
        
        // 處理 URL 格式
        let finalUrl = url;
        if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://") && !finalUrl.startsWith("./") && !finalUrl.startsWith("file://")) {
            finalUrl = "https://" + finalUrl;
        }
        
        const pinnedUrls = loadPinnedUrls();
        
        if (editingUrlIndex !== null) {
            // 編輯模式
            pinnedUrls[editingUrlIndex] = { name, url: finalUrl };
        } else {
            // 新增模式
            pinnedUrls.push({ name, url: finalUrl });
        }
        
        savePinnedUrls(pinnedUrls);
        
        // 重新渲染按鈕
        renderPinnedButtons();
        
        closePinModal();
    }

    pinModal.addEventListener("click", (e) => {
        if (e.target === pinModal) {
            closePinModal();
        }
    });
    
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

    updateEngineDisplay();
    updateSiteButtons();
    renderPinnedSearchButtons();
    renderPinnedButtons();
    
    // 監聽搜尋框輸入，更新選單內容
    searchBox.addEventListener("input", () => {
        updateSiteButtons();
        renderRecentSearchMenu(searchBox.value);
    });
});
