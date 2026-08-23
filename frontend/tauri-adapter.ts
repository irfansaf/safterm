// SafTerm — Tauri preload adapter
//
// Replaces Electron's contextBridge ("window.api") with Tauri invoke() calls.
// The frontend (WaveEnv) expects `window.api` to have ElectronApi shape.
//
// NOTE: This file is imported by the main app entry (wave.ts). It gracefully
// degrades when running outside Tauri (e.g. in regular browser, electron-vite).

// ── Immediate fallback stub ────────────────────────────────────────
// wave.ts calls getApi() synchronously on boot. The adapter needs to
// provide window.api before the app imports execute.
// This runs inline (not async) so it's available when the app boots.

function injectFallbackApi() {
    return {
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
        setWindowInitStatus: async () => {},
        updateWindowControlsOverlay: async () => {},
        sendLog: (msg: string) => console.log("[stub]", msg),
        onWaveInit: () => {},
        onBuilderInit: () => {},
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
}

// Inject BEFORE any app code runs
(window as any).api = injectFallbackApi();

// ── Stub that simulates the Electron init flow ─────────────────
// When the app calls setWindowInitStatus("ready"), we fire
// onWaveInit with mock init options so the app boots normally.

let waveInitCallbacks: Array<(opts: any) => void> = [];
let builderInitCallbacks: Array<(opts: any) => void> = [];

function fireWaveInit() {
    const initOpts = {
        clientId: "tauri-dev-client",
        tabId: "tauri-dev-tab",
        windowId: "tauri-dev-window",
        workspaceId: "tauri-dev-workspace",
    };
    waveInitCallbacks.forEach((cb) => cb(initOpts));
}

// Callbacks that store registered listeners
let onWaveInitCb: ((opts: any) => void) | null = null;
let onBuilderInitCb: ((opts: any) => void) | null = null;

function injectFallbackApi() {
    return {
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
        // This is the key one — fires wave init
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
}

async function setupTauri() {
    try {
        const api = await import("@tauri-apps/api/core");
        const { initTauriEvents } = await import("./tauri-events");

        // Override with real Tauri API
        (window as any).api = {
            ...(window as any).api, // keep fallback values as base
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
        };

        await initTauriEvents();
        console.log("[tauri] adapter upgraded from stub");
    } catch {
        console.log("[tauri] not running in Tauri, using fallback stub");
    }
}

setupTauri();

export {};