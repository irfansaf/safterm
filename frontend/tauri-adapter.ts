// SafTerm — Tauri preload adapter
//
// Injects window.api before any app code runs, then upgrades
// to real Tauri IPC if available.

// ── Callbacks ─────────────────────────────────────────────────────
let onWaveInitCb: ((opts: any) => void) | null = null;
let onBuilderInitCb: ((opts: any) => void) | null = null;

// ── Synchronous fallback (runs before any imports) ───────────────
(window as any).api = {
    getIsDev: async () => true,
    getPlatform: async () => "macos",
    getHomeDir: async () => "~",
    getDataDir: async () => ".",
    getConfigDir: async () => ".",
    getEnv: async () => "",
    getUserName: async () => "dev",
    getHostName: async () => "localhost",
    getZoomFactor: async () => 1.0,
    openNewWindow: async () => {},
    createWorkspace: async () => {},
    switchWorkspace: async () => {},
    deleteWorkspace: async () => {},
    closeTab: async () => true,
    openExternal: () => {},
    openNativePath: () => {},
    getPathForFile: (p: string | null) => p ?? "",
    saveTextFile: async () => false,
    downloadFile: () => {},
    captureScreenshot: async () => "",
    showOpenDialog: async () => null,
    setWindowInitStatus: async (status: string) => {
        if (status === "ready" && onWaveInitCb) {
            setTimeout(() => onWaveInitCb!({
                clientId: "tauri-dev-client",
                tabId: "tauri-dev-tab",
                windowId: "tauri-dev-window",
            }), 0);
        }
    },
    updateWindowControlsOverlay: async () => {},
    sendLog: (msg: string) => console.log("[stub]", msg),
    onWaveInit: (cb: (opts: any) => void) => { onWaveInitCb = cb; },
    onBuilderInit: (cb: (opts: any) => void) => { onBuilderInitCb = cb; },
    onFullScreenChange: () => {},
    onZoomFactorChange: () => {},
    onUpdaterStatusChange: () => {},
    onMenuItemAbout: () => {},
    onReinjectKey: () => {},
    onControlShiftStateUpdate: () => {},
    onNavigate: () => {},
    onIframeNavigate: () => {},
    onQuicklook: () => {},
    showContextMenu: () => {},
    onContextMenuClick: () => {},
    getAuthKey: () => "stub",
    getCursorPoint: () => ({ x: 0, y: 0 }),
    setWebviewFocus: () => {},
    registerGlobalWebviewKeys: () => {},
    setKeyboardChordMode: () => {},
    clearWebviewStorage: async () => {},
    incrementTermCommands: async () => {},
    setIsActive: async () => {},
    getUpdaterStatus: () => ({}),
    getUpdaterChannel: () => "stable",
    installAppUpdate: () => {},
    getAboutModalDetails: () => ({ version: "0.14.5" }),
    getWebviewPreload: () => "",
    showWorkspaceAppMenu: () => {},
    showBuilderAppMenu: () => {},
    closeWindow: async () => {},
    getWindowLabels: async () => [],
    nativePaste: async () => {},
    doRefresh: () => {},
    setWaveAIOpen: () => {},
    closeBuilderWindow: () => {},
    openBuilder: () => {},
    setBuilderWindowAppId: () => {},
};

// ── Upgrade to Tauri (async, non-blocking) ────────────────────────
async function setupTauri() {
    try {
        const api = await import("@tauri-apps/api/core");
        const { initTauriEvents } = await import("./tauri-events");

        Object.assign((window as any).api, {
            getPlatform: async () => navigator.platform,
            getUserName: () => api.invoke("get_user_name"),
            getHostName: () => api.invoke("get_host_name"),
            getHomeDir: () => api.invoke("get_home_dir"),
            getDataDir: () => api.invoke("get_data_dir"),
            getConfigDir: () => api.invoke("get_config_dir"),
            getEnv: (varName: string) => api.invoke("get_env", { varName }),
            openNewWindow: () => api.invoke("open_new_window"),
            closeWindow: (label: string) => api.invoke("close_window", { label }),
            getWindowLabels: () => api.invoke("get_window_labels"),
            showOpenDialog: (opts?: { title?: string; defaultPath?: string }) =>
                api.invoke("browse_folder", {
                    title: opts?.title ?? null,
                    defaultPath: opts?.defaultPath ?? null,
                }),
            saveTextFile: (fileName: string, content: string) =>
                api.invoke("save_text_file", { fileName, content }),
            downloadFile: (path: string) => api.invoke("download_file", { path }),
            openExternal: (url: string) => api.invoke("open_external", { url }),
            openNativePath: (path: string) => api.invoke("open_native_path", { path }),
            doRefresh: () => api.invoke("do_refresh"),
            nativePaste: () => api.invoke("native_paste"),
            setKeyboardChordMode: () => api.invoke("set_keyboard_chord_mode"),
            captureScreenshot: (rect: any) => api.invoke("capture_screenshot", { rect }),
            clearWebviewStorage: () => api.invoke("clear_webview_storage"),
            incrementTermCommands: (opts?: any) =>
                api.invoke("increment_term_commands", { opts }),
            sendLog: (msg: string) => console.log("[tauri]", msg),
            getIsDev: async () => true,
        });

        await initTauriEvents();
        console.log("[tauri] adapter upgraded from stub");
    } catch {
        console.log("[tauri] not running in Tauri, using fallback stub");
    }
}

setupTauri();
export {};