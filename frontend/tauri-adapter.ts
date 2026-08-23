// SafTerm — Tauri preload adapter
//
// Replaces Electron's contextBridge ("window.api") with Tauri invoke() calls.
// The frontend (WaveEnv) expects `window.api` to have ElectronApi shape.
//
// NOTE: This file is imported by the main app entry (wave.ts). It gracefully
// degrades when running outside Tauri (e.g. in regular browser, electron-vite).

// ── Detect Tauri runtime ───────────────────────────────────────────
// @tauri-apps/api is only available inside Tauri's webview.
// If it can't be loaded, we skip injection (Electron provides its own window.api).

async function setupTauri() {
    try {
        const api = await import("@tauri-apps/api/core");
        const { initTauriEvents } = await import("./tauri-events");

        // ── Build the API object ──────────────────────────────────
        const tauriApi = {
            getIsDev: async () => true, // always dev in this context
            getPlatform: async () => navigator.platform,
            getUserName: () => api.invoke("get_user_name"),
            getHostName: () => api.invoke("get_host_name"),
            getHomeDir: () => api.invoke("get_home_dir"),
            getDataDir: () => api.invoke("get_data_dir"),
            getConfigDir: () => api.invoke("get_config_dir"),
            getEnv: (varName: string) => api.invoke("get_env", { varName }),
            getZoomFactor: async () => 1.0,

            openNewWindow: () => api.invoke("open_new_window"),
            closeWindow: (label: string) => api.invoke("close_window", { label }),
            getWindowLabels: () => api.invoke("get_window_labels"),
            createWorkspace: async () => {
                await api.invoke("open_new_window");
            },
            switchWorkspace: async () => {},
            deleteWorkspace: async (wsId: string) => {
                await api.invoke("close_window", { label: `workspace-${wsId}` });
            },
            createTab: async () => {},
            closeTab: async () => true,
            setActiveTab: async () => {},
            setWindowInitStatus: async () => {},
            updateWindowControlsOverlay: async () => {},

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
            getPathForFile: (path: string | null) => path ?? "",

            doRefresh: () => api.invoke("do_refresh"),
            setWaveAIOpen: () => {},
            nativePaste: () => api.invoke("native_paste"),
            closeBakerWindow: () => {},
            openBaker: () => {},
            setBakerWindowAppId: () => {},

            showContextMenu: () => {},
            onContextMenuClick: () => {},

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

            getAuthKey: () => "tauri-dev",
            getCursorPoint: () => ({ x: 0, y: 0 }),
            setWebviewFocus: () => {},
            registerGlobalWebviewKeys: () => {},
            setKeyboardChordMode: () => api.invoke("set_keyboard_chord_mode"),
            sendLog: (msg: string) => console.log("[tauri]", msg),
            captureScreenshot: (rect: any) => api.invoke("capture_screenshot", { rect }),
            clearWebviewStorage: () => api.invoke("clear_webview_storage"),
            incrementTermCommands: (opts?: any) =>
                api.invoke("increment_term_commands", { opts }),
            setIsActive: async () => {},
            getUpdaterStatus: () => ({}),
            getUpdaterChannel: () => "stable",
            installAppUpdate: () => {},
            getAboutModalDetails: () => ({ version: "0.14.5" }),
            getWebviewPreload: () => "",
            showWorkspaceAppMenu: () => {},
            showBuilderAppMenu: () => {},
        };

        (window as any).api = tauriApi;
        await initTauriEvents();
        console.log("[tauri] adapter initialized");
    } catch {
        // Not running in Tauri — window.api is already set by Electron preload,
        // or this is a regular browser (no-op).
        console.log("[tauri] not running in Tauri, skipping adapter");
    }
}

// Run eagerly but don't block app startup
setupTauri();

// Fallback: if window.api wasn't set by Electron preload and Tauri
// didn't load, inject a minimal stub so the app can render an error.
setTimeout(() => {
    if (!(window as any).api) {
        console.warn("[tauri] no window.api available, injecting fallback stub");
        (window as any).api = {
            getIsDev: async () => true,
            getPlatform: async () => "web",
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
            getAboutModalDetails: () => ({ version: "0.14.5-stub" }),
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
}, 500);

export {};