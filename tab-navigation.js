const { ipcMain } = require('electron');

const guests = new Map();

function snapshot(state) {
    const history = state.contents.navigationHistory;
    state.entries = history.getAllEntries();
    state.index = history.getActiveIndex();
    return {
        webContentsId: state.contents.id,
        sequence: ++state.sequence,
        revision: state.revision,
        visitRevision: state.visitRevision,
        entries: state.entries.map((entry, index) => ({
            url: entry.url, title: entry.title, visible: !state.subframeEntries.has(index)
        })),
        index: state.index
    };
}

function ownedGuest(event, id) {
    const state = guests.get(id);
    if (!state || state.host !== event.sender || state.contents.isDestroyed()) {
        throw new Error('Unknown tab');
    }
    return state;
}

ipcMain.handle('tab-history-state', (event, id) => snapshot(ownedGuest(event, id)));

ipcMain.handle('tab-history-go', (event, { id, index, revision }) => {
    const state = ownedGuest(event, id);
    const history = state.contents.navigationHistory;
    // A button from an older navigation must never target a different entry.
    if (revision === state.revision && Number.isInteger(index) &&
        index >= 0 && index < history.length() && index !== history.getActiveIndex()) {
        history.goToIndex(index);
    }
    return snapshot(state);
});

function registerTabNavigation(host) {
    host.on('did-attach-webview', (_event, contents) => {
        const state = {
            host, contents, sequence: 0, revision: 0, visitRevision: 0,
            entries: [], index: -1, subframeEntries: new Set()
        };
        guests.set(contents.id, state);
        const publish = () => {
            if (!host.isDestroyed() && !contents.isDestroyed()) {
                host.send('tab-history-updated', snapshot(state));
            }
        };
        const committed = (isMainFrame) => {
            const entries = contents.navigationHistory.getAllEntries();
            const index = contents.navigationHistory.getActiveIndex();
            const previous = state.entries[index];
            const current = entries[index];
            const traversed = entries.length === state.entries.length && previous && current &&
                previous.url === current.url && previous.pageState === current.pageState;
            // Chromium includes iframe-only steps in its joint session history.
            // Keep their native indices, but omit newly created subframe steps from the trail.
            if (index !== state.index && !traversed) {
                if (!isMainFrame) state.subframeEntries.add(index);
            }
            state.subframeEntries = new Set([...state.subframeEntries].filter(i => i < entries.length));
            if (isMainFrame) {
                state.subframeEntries.delete(index);
                state.visitRevision++;
            }
            state.revision++;
            publish();
        };
        contents.on('did-navigate', () => committed(true));
        contents.on('did-navigate-in-page', (_event, _url, isMainFrame) => {
            committed(isMainFrame);
        });
        contents.on('did-frame-navigate', (_event, _url, _code, _status, isMainFrame) => {
            if (!isMainFrame) committed(false);
        });
        contents.on('page-title-updated', publish);
        contents.on('did-stop-loading', publish);
        contents.on('did-fail-load', (_event, _code, _description, _url, isMainFrame) => {
            if (isMainFrame) publish();
        });
        contents.setWindowOpenHandler(({ url }) => {
            if (!host.isDestroyed()) host.send('tab-open-request', { id: contents.id, url });
            return { action: 'deny' };
        });
        contents.once('destroyed', () => guests.delete(contents.id));
    });
}

module.exports = { registerTabNavigation };
