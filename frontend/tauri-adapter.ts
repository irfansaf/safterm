// SafTerm — Tauri preload adapter
//
// Replaces Electron's contextBridge ("window.api") with Tauri invoke() calls.
// The frontend (WaveEnv) expects `window.api` to have ElectronApi shape.
// This file provides the same API surface backed by Tauri IPC.

import { invoke } from "@tauri-apps/api/core";

interface TauriApi {
    // ── Synchronous getters (Electron: ipcRenderer.sendSync → Tauri: invoke) ──
    getIsDev: () => Promise<boolean>;
    getPlatform: () => Promise<string>;
    getUserName: () => Promise<string>;
    getHostName: () => Promise<string>;
    getHomeDir: () => Promise<string>;
    getDataDir: () => Promise<string>;
    getConfigDir: () => Promise<string>;
    getEnv: (varName: string) => Promise<string>;
    getZoomFactor: () => Promise<number>;

    // ── Window management ──
    createWorkspace: () => Promise<void>;
    switchWorkspace: (workspaceId: string) => Promise<void>;
    deleteWorkspace: (workspaceId: string) => Promise<void>;
    openNewWindow: () => Promise<void>;
    createTab: () => Promise<void>;
    closeTab: (workspaceId: string, tabId: string, confirmClose: boolean) => Promise<boolean>;
    setActiveTab: (tabId: string) => Promise<void>;
    setWindowInitStatus: (status: string) => Promise<void>;
    updateWindowControlsOverlay: (rect: any) => Promise<void>;

    // ── Dialogs / File ──
    showOpenDialog: (opts?: { title?: string; defaultPath?: string }) => Promise<string | null>;
    saveTextFile: (fileName: string, content: string) => Promise<boolean>;
    downloadFile: (path: string) => void;
    openExternal: (url: string) => void;
    openNativePath: (filePath: string) => void;
    getPathForFile: (file: File) => string;

    // ── Shell / App ──
    doRefresh: () => void;
    setWaveAIOpen: (isOpen: boolean) => void;
    nativePaste: () => void;
    closeBuilderWindow: () => void;
    openBuilder: (appId?: string) => void;
    setBuilderWindowAppId: (appId: string) => void;

    // ── Context menus ──
    showContextMenu: (workspaceId: string, menu: any[]) => void;
    onContextMenuClick: (callback: (id: string | null) => void) => void;

    // ── Events (Tauri events replace ipcRenderer.on) ──
    onWaveInit: (callback: (initOpts: any) => void) => void;
    onBuilderInit: (callback: (initOpts: any) => void) => void;
    onFullScreenChange: (callback: (isFullScreen: boolean) => void) => void;
    onZoomFactorChange: (callback: (zoomFactor: number) => void) => void;
    onUpdaterStatusChange: (callback: (status: any) => void) => void;
    onMenuItemAbout: (callback: () => void) => void;
    onReinjectKey: (callback: (waveEvent: any) => void) => void;
    onControlShiftStateUpdate: (callback: (state: boolean) => void) => void;
    onNavigate: (callback: (url: string) => void) => void;
    onIframeNavigate: (callback: (url: string) => void) => void;
    onQuicklook: (filePath: string) => void;

    // ── Other ──
    getAuthKey: () => string;
    getCursorPoint: () => any;
    setWebviewFocus: (focusedId: number) => void;
    registerGlobalWebviewKeys: (keys: string[]) => void;
    setKeyboardChordMode: () => void;
    sendLog: (log: string) => void;
    captureScreenshot: (rect: any) => Promise<string>;
    clearWebviewStorage: (webContentsId: number) => Promise<void>;
    incrementTermCommands: (opts?: any) => void;
    setIsActive: () => Promise<void>;
    getUpdaterStatus: () => any;
    getUpdaterChannel: () => string;
    installAppUpdate: () => void;
    getAboutModalDetails: () => any;
    getWebviewPreload: () => string;
    showWorkspaceAppMenu: (workspaceId: string) => void;
    showBuilderAppMenu: (builderId: string) => void;
}

// ── Build the API object ──────────────────────────────────────────
// We map Tauri invoke calls to match the ElectronApi shape.
// Some methods are no-ops in Tauri (context menus, macOS-specific things).
// Some need Tauri plugins not yet wired (updater, workspace menus).

const tauriApi: TauriApi = {
    // ── Getters ──
    getIsDev: () => invoke("get_is_dev"),
    getPlatform: () => invoke("get_platform"),
    getUserName: () => invoke("get_user_name"),
    getHostName: () => invoke("get_host_name"),
    getHomeDir: () => invoke("get_home_dir"),
    getDataDir: () => invoke("get_data_dir"),
    getConfigDir: () => invoke("get_config_dir"),
    getEnv: (varName: string) => invoke("get_env", { varName }),
    getZoomFactor: async () => 1.0, // Tauri doesn't have zoom factor natively

    // ── Window management ──
    openNewWindow: async () => {
        await invoke("create_new_window");
    },
    createWorkspace: async () => {
        // pony tail: Tauri-side workspace management not yet implemented.
        // The React side manages workspaces via WOS. This just creates a window.
    },
    switchWorkspace: async () => {},
    deleteWorkspace: async () => {},
    createTab: async () => {},
    closeTab: async () => true,
    setActiveTab: async () => {},
    setWindowInitStatus: async () => {},
    updateWindowControlsOverlay: async () => {},

    // ── Dialogs / File ──
    showOpenDialog: (opts) => invoke("browse_folder", {
        title: opts?.title ?? null,
        defaultPath: opts?.defaultPath ?? null,
    }),
    saveTextFile: async () => false,
    downloadFile: () => {},
    openExternal: (url: string) => {
        invoke("open_external", { url }).catch(() => {});
    },
    openNativePath: () => {},
    getPathForFile: (file: File) => (file as any).path ?? "",

    // ── Shell / App ──
    doRefresh: () => window.location.reload(),
    setWaveAIOpen: () => {},
    nativePaste: () => {},
    closeBuilderWindow: () => {},
    openBuilder: () => {},
    setBuilderWindowAppId: () => {},

    // ── Context menus (no-op for now, frontend uses HTML menus) ──
    showContextMenu: () => {},
    onContextMenuClick: () => {},

    // ── Events ──
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

    // ── Other (no-ops or stubs) ──
    getAuthKey: () => "tauri-dev",
    getCursorPoint: () => ({ x: 0, y: 0 }),
    setWebviewFocus: () => {},
    registerGlobalWebviewKeys: () => {},
    setKeyboardChordMode: () => {},
    sendLog: (msg: string) => console.log("[tauri]", msg),
    captureScreenshot: async () => "",
    clearWebviewStorage: async () => {},
    incrementTermCommands: () => {},
    setIsActive: async () => {},
    getUpdaterStatus: () => ({}),
    getUpdaterChannel: () => "stable",
    installAppUpdate: () => {},
    getAboutModalDetails: () => ({ version: "0.14.5" }),
    getWebviewPreload: () => "",
    showWorkspaceAppMenu: () => {},
    showBuilderAppMenu: () => {},
};

// ── Inject onto window ────────────────────────────────────────────
// The WaveEnv implementation reads `(window as any).api`
(window as any).api = tauriApi;

export { tauriApi };