import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => ({
  // Dev server uniquement — la prod sert désormais un vrai build statique
  // (`vite build` -> dist/) via nginx, plus de serveur Vite exposé publiquement.
  server: {
    host: "::",
    port: 8080,
    fs: {
      deny: [".git"],
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        ws: true,
      },
      "/uploads": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },

  plugins: [
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),

  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },

  esbuild: {
    drop: mode === "production" ? ["console", "debugger"] : [],
  },

  optimizeDeps: {
    exclude: [".git"],
  },
}));