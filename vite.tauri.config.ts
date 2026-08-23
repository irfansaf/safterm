// SafTerm — Vite config for Tauri build
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import svgr from "vite-plugin-svgr";
import path from "path";

export default defineConfig({
    plugins: [react(), svgr()],
    resolve: {
        alias: {
            // No wildcard "@" — use explicit prefixes matching tsconfig paths.
            // Order matters: most specific first.
            "@/store": path.resolve(__dirname, "frontend/app/store"),
            "@/app": path.resolve(__dirname, "frontend/app"),
            "@/builder": path.resolve(__dirname, "frontend/builder"),
            "@/util": path.resolve(__dirname, "frontend/util"),
            "@/layout": path.resolve(__dirname, "frontend/layout"),
            "@/view": path.resolve(__dirname, "frontend/app/view"),
            "@/element": path.resolve(__dirname, "frontend/app/element"),
            "@/shadcn": path.resolve(__dirname, "frontend/app/shadcn"),
            "@/preview": path.resolve(__dirname, "frontend/preview"),
            "~": path.resolve(__dirname, "frontend"),
        },
    },
    build: {
        outDir: "dist/frontend",
        rollupOptions: {
            external: ["@tauri-apps/api/core"],
        },
    },
    server: {
        port: 5173,
    },
});