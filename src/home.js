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

    // ?脣??揣撘??迂
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

    // ?瑁??揣
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

    // ?瑁?蝬脩??揣
    function performSiteSearch(site) {
        const query = searchBox.value.trim();
        if (query) {
            const siteQuery = `${query} site:${site}`;
            performSearch(siteQuery);
        }
    }

    // ?湔蝬脩???憿舐內
    function updateSiteButtons() {
        siteButtonsContainer.innerHTML = "";
        siteButtonsContainer.style.display = "none";
    }

    // ?揣??暺?
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

    // 銝????暺?
    engineDropdownBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        engineDropdownMenu.classList.toggle("show");
    });

    // ?豢??揣撘?
    engineOptions.forEach(option => {
        option.addEventListener("click", (e) => {
            e.stopPropagation();
            const engine = option.dataset.engine;
            localStorage.setItem("search-engine", engine);
            updateEngineDisplay();
            engineDropdownMenu.classList.remove("show");
        });
    });

    // 暺?憭??銝??
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
                // 憒??孵????嚗??扯??揣
                if (e.target.closest('.pinned-button-menu-btn')) {
                    return;
                }
                // ?扯??揣
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
        
        // 瘛餃? + ?嚗?蝏??剁?
        const addButton = document.createElement("button");
        addButton.className = "add-pinned-search-button";
        addButton.innerHTML = `<span class="material-symbols-outlined pinned-add-icon">add_2</span>`;
        addButton.addEventListener("click", () => {
            openPinSearchModal();
        });
        pinnedSearchContainer.appendChild(addButton);
    }

    // 敶?蝻???蝝Ｚ?蝝Ｗ?嚗ull 銵函內?啣?嚗?    let editingSearchIndex = null;
    
    // ???揣霂??笆霂?
    function openPinSearchModal() {
        editingSearchIndex = null;
        pinSearchInput.value = "";
        document.getElementById("pin-search-modal-title").textContent = "新增釘選搜尋詞";
        const buttons = document.getElementById("pin-search-modal-buttons");
        buttons.className = "modal-buttons";
        buttons.innerHTML = `
            <button class="modal-button modal-button-cancel" id="pin-search-cancel-btn">??</button>
            <button class="modal-button modal-button-confirm" id="pin-search-confirm-btn">蝣箏?</button>
        `;
        // ?蝏?鈭辣
        document.getElementById("pin-search-cancel-btn").addEventListener("click", closePinSearchModal);
        document.getElementById("pin-search-confirm-btn").addEventListener("click", confirmPinSearch);
        pinSearchModal.classList.add("show");
        pinSearchInput.focus();
    }
    
    // ??蝻??揣霂笆霂?
    function openEditPinSearchModal(index, searchTerm) {
        editingSearchIndex = index;
        pinSearchInput.value = searchTerm;
        document.getElementById("pin-search-modal-title").textContent = "編輯釘選搜尋詞";
        const buttons = document.getElementById("pin-search-modal-buttons");
        buttons.className = "modal-buttons three-buttons";
        buttons.innerHTML = `
            <button class="modal-button modal-button-delete" id="pin-search-delete-btn">?芷</button>
            <button class="modal-button modal-button-cancel" id="pin-search-cancel-btn">??</button>
            <button class="modal-button modal-button-confirm" id="pin-search-confirm-btn">蝣箏?</button>
        `;
        // ?蝏?鈭辣
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

    // ?喲?揣霂??笆霂?
    function closePinSearchModal() {
        pinSearchModal.classList.remove("show");
    }

    // 蝖株恕瘛餃???颲???蝝Ｚ?
    function confirmPinSearch() {
        const searchTerm = pinSearchInput.value.trim();
        
        if (!searchTerm) {
            alert("隢撓?交?撠?");
            return;
        }
        
        const pinnedSearches = loadPinnedSearches();
        
        if (editingSearchIndex !== null) {
            // 蝻?璅∪?
            pinnedSearches[editingSearchIndex] = searchTerm;
        } else {
            // ?啣?璅∪?
            pinnedSearches.push(searchTerm);
        }
        
        savePinnedSearches(pinnedSearches);
        
        // ?皜脫??
        renderPinnedSearchButtons();
        
        // ?喲撖寡?獢?        closePinSearchModal();
    }

    // ?揣霂??笆霂?鈭辣
    pinSearchCancelBtn.addEventListener("click", closePinSearchModal);
    pinSearchConfirmBtn.addEventListener("click", confirmPinSearch);
    
    // ?孵?揣霂笆霂?憭?喲
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

    // 頛?蝬脣?
    function loadPinnedUrls() {
        return JSON.parse(localStorage.getItem("pinned-urls") || "[]");
    }

    // 靽??蝬脣?
    function savePinnedUrls(urls) {
        localStorage.setItem("pinned-urls", JSON.stringify(urls));
    }

    // 皜脫????
    function renderPinnedButtons() {
        pinnedButtonsContainer.innerHTML = "";
        const pinnedUrls = loadPinnedUrls();
        
        // 皜脫?撌脖?摮??
        pinnedUrls.forEach((item, index) => {
            const wrapper = document.createElement("div");
            wrapper.className = "pinned-button-wrapper";
            
            const button = document.createElement("button");
            button.className = "pinned-button";
            button.textContent = item.name;
            button.addEventListener("click", (e) => {
                // 憒??孵????嚗??扯?撖潸
                if (e.target.closest('.pinned-button-menu-btn')) {
                    return;
                }
                // 撖潸?啁??
                if (window.MiniBrowserAPI && window.MiniBrowserAPI.navigateToUrl) {
                    window.MiniBrowserAPI.navigateToUrl(item.url);
                } else if (window.MiniBrowserAPI && window.MiniBrowserAPI.search) {
                    // 憒?瘝⊥? navigateToUrl嚗蝙??search ?寞?嚗?憭? URL嚗?                    window.MiniBrowserAPI.search(item.url);
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
        
        // 瘛餃? + ?嚗?蝏??剁?
        const addButton = document.createElement("button");
        addButton.className = "add-pinned-button";
        addButton.innerHTML = `<span class="material-symbols-outlined pinned-add-icon">add_2</span>`;
        addButton.addEventListener("click", () => {
            openPinModal();
        });
        pinnedButtonsContainer.appendChild(addButton);
    }

    // 敶?蝻????蝝Ｗ?嚗ull 銵函內?啣?嚗?    let editingUrlIndex = null;
    
    // ???笆霂?
    function openPinModal() {
        editingUrlIndex = null;
        pinNameInput.value = "";
        pinUrlInput.value = "";
        document.getElementById("pin-modal-title").textContent = "?啣??蝬脣?";
        const buttons = document.getElementById("pin-modal-buttons");
        buttons.className = "modal-buttons";
        buttons.innerHTML = `
            <button class="modal-button modal-button-cancel" id="pin-cancel-btn">??</button>
            <button class="modal-button modal-button-confirm" id="pin-confirm-btn">蝣箏?</button>
        `;
        // ?蝏?鈭辣
        document.getElementById("pin-cancel-btn").addEventListener("click", closePinModal);
        document.getElementById("pin-confirm-btn").addEventListener("click", confirmPin);
        pinModal.classList.add("show");
        pinNameInput.focus();
    }
    
    function openEditPinModal(index, name, url) {
        editingUrlIndex = index;
        pinNameInput.value = name;
        pinUrlInput.value = url;
        document.getElementById("pin-modal-title").textContent = "蝺刻摩?蝬脣?";
        const buttons = document.getElementById("pin-modal-buttons");
        buttons.className = "modal-buttons three-buttons";
        buttons.innerHTML = `
            <button class="modal-button modal-button-delete" id="pin-delete-btn">?芷</button>
            <button class="modal-button modal-button-cancel" id="pin-cancel-btn">??</button>
            <button class="modal-button modal-button-confirm" id="pin-confirm-btn">蝣箏?</button>
        `;
        // ?蝏?鈭辣
        document.getElementById("pin-delete-btn").addEventListener("click", deletePin);
        document.getElementById("pin-cancel-btn").addEventListener("click", closePinModal);
        document.getElementById("pin-confirm-btn").addEventListener("click", confirmPin);
        pinModal.classList.add("show");
        pinNameInput.focus();
    }
    
    // ?蝵?
    function deletePin() {
        if (editingUrlIndex === null) return;
        
        const pinnedUrls = loadPinnedUrls();
        pinnedUrls.splice(editingUrlIndex, 1);
        savePinnedUrls(pinnedUrls);
        
        renderPinnedButtons();
        closePinModal();
    }

    // ?喲?笆霂?
    function closePinModal() {
        pinModal.classList.remove("show");
    }

    // 蝖株恕瘛餃???颲????
    function confirmPin() {
        const name = pinNameInput.value.trim();
        const url = pinUrlInput.value.trim();
        
        if (!name || !url) {
            alert("隢‵撖急???蝔勗?蝬脣?");
            return;
        }
        
        // 憭? URL ?澆?
        let finalUrl = url;
        if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://") && !finalUrl.startsWith("./") && !finalUrl.startsWith("file://")) {
            finalUrl = "https://" + finalUrl;
        }
        
        const pinnedUrls = loadPinnedUrls();
        
        if (editingUrlIndex !== null) {
            // 蝻?璅∪?
            pinnedUrls[editingUrlIndex] = { name, url: finalUrl };
        } else {
            // ?啣?璅∪?
            pinnedUrls.push({ name, url: finalUrl });
        }
        
        savePinnedUrls(pinnedUrls);
        
        // ?皜脫??
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
    
    // ???揣獢撓?伐?憿舐內蝬脩???
    searchBox.addEventListener("input", () => {
        updateSiteButtons();
        renderRecentSearchMenu(searchBox.value);
    });
});
