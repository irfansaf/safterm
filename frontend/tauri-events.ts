// SafTerm — Event listeners for Tauri
//
// Tauri uses a different event system than Electron's ipcRenderer.
// We bridge the gap by listening to Tauri window events and forwarding
// them to the frontend's existing callback pattern.

import { listen } from "@tauri-apps/api/event";

// ── Full screen change ────────────────────────────────────────────
// Tauri fires WindowEvent::FullscreenChanged. We can't directly
// listen to that, but we can poll via window.fullscreen.
// pony tail: the frontend UI adapts via CSS media queries anyway.

// ── Zoom factor change ────────────────────────────────────────────
// Tauri doesn't have a per-webview zoom API. The frontend uses
// CSS zoom/transform. Stub — frontend handles this natively.

// ── Updater status ────────────────────────────────────────────────
// tauri-plugin-updater emits events we can listen to.

// ── Window init (Wave-specific) ──────────────────────────────────
// In Electron: ipcRenderer.on("wave-init", callback)
// In Tauri: we fire this manually after wavesrv is ready.

// ── Reinject keys ─────────────────────────────────────────────────
// Electron had a global shortcut system that re-injected chords.
// Tauri has tauri-plugin-global-shortcut for this later.

// ── Control+Shift state ──────────────────────────────────────────
// Electron tracked modifier key state. Tauri's WebView handles
// this natively — the keyboard events bubble correctly.

// ── Navigator events ─────────────────────────────────────────────
// window.onpopstate handles this natively. No bridge needed.

/**
 * Initialize Tauri event listeners that mirror Electron's ipcRenderer.on() events.
 * Called once during app startup.
 */
export async function initTauriEvents() {
    // Listen for Tauri updater status changes
    try {
        const unlisten = await listen<string>("updater://status", (event) => {
            // Bridge to whatever handler the frontend registered
            if ((window as any).__onUpdaterStatusChange) {
                (window as any).__onUpdaterStatusChange(event.payload);
            }
        });
        // Store so we can unlisten later if needed
        (window as any).__unlistenUpdater = unlisten;
    } catch {
        // Updater plugin may not be registered — that's fine
    }

    // Listen for window close events (for cleanup)
    listen("tauri://close-requested", () => {
        // Let the React app handle clean shutdown
        console.log("[tauri] close requested");
    });

    // Listen for fullscreen changes
    listen("tauri://fullscreen", (event: any) => {
        if ((window as any).__onFullScreenChange) {
            (window as any).__onFullScreenChange(event.payload);
        }
    });

    console.log("[tauri] event listeners initialized");
}