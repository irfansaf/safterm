// SafTerm — Tauri preload adapter
//
// Injects window.api before any app code runs, then upgrades
// to real Tauri IPC if available.

// ── Loading screen ──────────────────────────────────────────────
// Show immediately before app boots. Rust calls __safTermReady()
// once the ws endpoint is injected, which boots the real app.

(function showLoadingScreen() {
    const style = document.createElement("style");
    style.textContent = `
        #saf-loading {
            position: fixed; inset: 0; z-index: 99999;
            display: flex; align-items: center; justify-content: center;
            background: #0d1117; color: #c3c8c2; font-family: system-ui;
            font-size: 16px;
        }
        #saf-loading .spinner {
            width: 32px; height: 32px; border: 3px solid #30363d;
            border-top-color: #58c142; border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin-right: 12px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);
    const div = document.createElement("div");
    div.id = "saf-loading";
    div.innerHTML = '<div class="spinner"></div>SafTerm is starting...';
    document.documentElement.appendChild(div);

    // This callback will be called by Rust's eval once endpoint is ready
    (window as any).__safTermReady = () => {
        console.log("[tauri] __safTermReady called");
        endpointReady = true;
        startWaveIfReady();
    };
})();

// Endpoint is filled synchronously before wave initialization starts.
(window as any).__SAFTERM_ENV = {
    WAVE_SERVER_WS_ENDPOINT: "",
    WAVE_SERVER_WEB_ENDPOINT: "",
};

let onWaveInitCb: ((opts: any) => void) | null = null;
let onBuilderInitCb: ((opts: any) => void) | null = null;
let endpointReady = false;
let waveStarted = false;
let initialWaveOpts = { clientId: "tauri-dev-client", tabId: "tauri-dev-tab", windowId: "tauri-dev-window" };

function startWaveIfReady() {
    if (!endpointReady || !onWaveInitCb || waveStarted) return;
    waveStarted = true;
    const cb = onWaveInitCb;
    console.log("[tauri] booting app with endpoint:", (window as any).__SAFTERM_ENV.WAVE_SERVER_WS_ENDPOINT);
    const el = document.getElementById("saf-loading");
    if (el) { el.style.opacity = "0"; setTimeout(() => el.remove(), 300); }
    cb(initialWaveOpts);
}
(window as any).api = {
    getIsDev: async () => true,
    getPlatform: async () => "macos",
    getHomeDir: async () => "~",
    getDataDir: async () => ".",
    getConfigDir: async () => ".",
    getEnv: (varName: string) => {
        return (window as any).__SAFTERM_ENV[varName] ?? "";
    },
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
        // Don't boot yet — wait for Rust to call __safTermReady()
        // which fires after the ws endpoint is injected.
        // The loading screen is already shown.
        if (status === "ready") {
            console.log("[tauri] setWindowInitStatus ready, waiting for Rust endpoint...");
        }
    },
    updateWindowControlsOverlay: async () => {},
    sendLog: (msg: string) => console.log("[stub]", msg),
    onWaveInit: (cb: (opts: any) => void) => {
        onWaveInitCb = cb;
        startWaveIfReady();
    },
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
    getAuthKey: () => "tauri-dev-auth-key-00000000",
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
        const { listen } = await import("@tauri-apps/api/event");
        const nativeFetch = window.fetch.bind(window);
        window.fetch = (input, init) => {
            const requestURL = new URL(
                typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
                window.location.href
            );
            const webEndpoint = (window as any).__SAFTERM_ENV?.WAVE_SERVER_WEB_ENDPOINT;
            if (webEndpoint && requestURL.host === webEndpoint) {
                const headers = new Headers(init?.headers);
                headers.set("X-AuthKey", "tauri-dev-auth-key-00000000");
                return nativeFetch(input, { ...init, headers });
            }
            return nativeFetch(input, init);
        };
        const { initTauriEvents } = await import("./tauri-events");

        Object.assign((window as any).api, {
            getPlatform: async () => navigator.platform,
            getUserName: () => api.invoke("get_user_name"),
            getHostName: () => api.invoke("get_host_name"),
            getHomeDir: () => api.invoke("get_home_dir"),
            getDataDir: () => api.invoke("get_data_dir"),
            getConfigDir: () => api.invoke("get_config_dir"),
            // Must stay synchronous: websocket setup reads this during init.
            getEnv: (varName: string) =>
                (window as any).__SAFTERM_ENV?.[varName] ?? "",
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
        const applyEndpoint = (endpoint: {
            ws: string;
            web: string;
            clientId?: string;
            windowId?: string;
            tabId?: string;
        }) => {
            (window as any).__SAFTERM_ENV = {
                WAVE_SERVER_WS_ENDPOINT: endpoint.ws,
                WAVE_SERVER_WEB_ENDPOINT: endpoint.web,
            };
            if (endpoint.clientId && endpoint.windowId && endpoint.tabId) {
                initialWaveOpts = {
                    clientId: endpoint.clientId,
                    windowId: endpoint.windowId,
                    tabId: endpoint.tabId,
                };
            }
            (window as any).__safTermReady?.();
        };
        type Endpoint = {
            ws: string;
            web: string;
            clientId?: string;
            windowId?: string;
            tabId?: string;
        };
        await listen<Endpoint>("wavesrv-ready", ({ payload }) => applyEndpoint(payload));
        await listen<{ ws: string; web: string }>("wavesrv-ready", ({ payload }) => applyEndpoint(payload));
        const endpoint = await api.invoke<Endpoint | null>("get_wavesrv_endpoint");
        if (endpoint) applyEndpoint(endpoint);
        console.log("[tauri] adapter upgraded from stub");
    } catch {
        console.log("[tauri] not running in Tauri, using fallback stub");
    }
}

setupTauri();
export {};