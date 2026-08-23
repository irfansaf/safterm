// SafTerm — Tauri preload adapter
//
// Replaces Electron's contextBridge ("window.api") with Tauri invoke() calls.
// The frontend (WaveEnv) expects `window.api` to have ElectronApi shape.

import { invoke } from "@tauri-apps/api/core";
import { initTauriEvents } from "./tauri-events";

// Initialize Tauri event listeners (fullscreen, updater, etc.)
initTauriEvents();

interface TauriApi {
    getIsDev: () => Promise<boolean>;
    getPlatform: () => Promise<string>;
    getUserName: () => Promise<string>;
    getHostName: () => Promise<string>;
    getHomeDir: () => Promise<string>;
    getDataDir: () => Promise<string>;
    getConfigDir: () => Promise<string>;
    getEnv: (varName: string) => Promise<string>;
    getZoomFactor: () => Promise<number>;

    // Window management
    openNewWindow: () => Promise<string>;
    closeWindow: (label: string) => Promise<void>;
    getWindowLabels: () => Promise<string[]>;
    createWorkspace: () => Promise<void>;
    switchWorkspace: (workspaceId: string) => Promise<void>;
    deleteWorkspace: (workspaceId: string) => Promise<void>;
    createTab: () => Promise<void>;
    closeTab: (workspaceId: string, tabId: string, confirmClose: boolean) => Promise<boolean>;
    setActiveTab: (tabId: string) => Promise<void>;
    setWindowInitStatus: (status: string) => Promise<void>;
    updateWindowControlsOverlay: (rect: any) => Promise<void>;

    // Dialogs / File
    showOpenDialog: (opts?: { title?: string; defaultPath?: string }) => Promise<string | null>;
    saveTextFile: (fileName: string, content: string) => Promise<boolean>;
    downloadFile: (path: string) => Promise<void>;
    openExternal: (url: string) => Promise<void>;
    openNativePath: (filePath: string) => Promise<void>;
    getPathForFile: (path: string | null) => string;

    // Shell / App
    doRefresh: () => Promise<void>;
    setWaveAIOpen: (isOpen: boolean) => void;
    nativePaste: () => Promise<void>;
    closeBuilderWindow: () => void;
    openBuilder: (appId?: string) => void;
    setBuilderWindowAppId: (appId: string) => void;

    // Context menus (HTML-based, no Tauri equivalent needed)
    showContextMenu: (workspaceId: string, menu: any[]) => void;
    onContextMenuClick: (callback: (id: string | null) => void) => void;

    // Events
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

    // Other
    getAuthKey: () => string;
    getCursorPoint: () => any;
    setWebviewFocus: (focusedId: number) => void;
    registerGlobalWebviewKeys: (keys: string[]) => void;
    setKeyboardChordMode: () => Promise<void>;
    sendLog: (log: string) => void;
    captureScreenshot: (rect: any) => Promise<string>;
    clearWebviewStorage: (webContentsId: number) => Promise<void>;
    incrementTermCommands: (opts?: any) => Promise<void>;
    setIsActive: () => Promise<void>;
    getUpdaterStatus: () => any;
    getUpdaterChannel: () => string;
    installAppUpdate: () => void;
    getAboutModalDetails: () => any;
    getWebviewPreload: () => string;
    showWorkspaceAppMenu: (workspaceId: string) => void;
    showBuilderAppMenu: (builderId: string) => void;
}

const tauriApi: TauriApi = {
    getIsDev: () => invoke("get_is_dev"),
    getPlatform: () => invoke("get_platform"),
    getUserName: () => invoke("get_user_name"),
    getHostName: () => invoke("get_host_name"),
    getHomeDir: () => invoke("get_home_dir"),
    getDataDir: () => invoke("get_data_dir"),
    getConfigDir: () => invoke("get_config_dir"),
    getEnv: (varName) => invoke("get_env", { varName }),
    getZoomFactor: async () => 1.0,

    openNewWindow: () => invoke("open_new_window"),
    closeWindow: (label) => invoke("close_window", { label }),
    getWindowLabels: () => invoke("get_window_labels"),
    createWorkspace: async () => { await invoke("open_new_window"); },
    switchWorkspace: async () => {},
    deleteWorkspace: async (wsId) => { await invoke("close_window", { label: `workspace-${wsId}` }); },
    createTab: async () => {},
    closeTab: async () => true,
    setActiveTab: async () => {},
    setWindowInitStatus: async () => {},
    updateWindowControlsOverlay: async () => {},

    showOpenDialog: (opts) => invoke("browse_folder", {
        title: opts?.title ?? null,
        defaultPath: opts?.defaultPath ?? null,
    }),
    saveTextFile: (fileName, content) => invoke("save_text_file", { fileName, content }),
    downloadFile: (path) => invoke("download_file", { path }),
    openExternal: (url) => invoke("open_external", { url }),
    openNativePath: (path) => invoke("open_native_path", { path }),
    getPathForFile: (path) => path ?? "",

    doRefresh: () => invoke("do_refresh"),
    setWaveAIOpen: () => {},
    nativePaste: () => invoke("native_paste"),
    closeBuilderWindow: () => {},
    openBuilder: () => {},
    setBuilderWindowAppId: () => {},

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
    setKeyboardChordMode: () => invoke("set_keyboard_chord_mode"),
    sendLog: (msg) => console.log("[tauri]", msg),
    captureScreenshot: (rect) => invoke("capture_screenshot", { rect }),
    clearWebviewStorage: () => invoke("clear_webview_storage"),
    incrementTermCommands: (opts) => invoke("increment_term_commands", { opts }),
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
export { tauriApi };