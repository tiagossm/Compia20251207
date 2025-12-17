import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// import { cloudflare } from "@cloudflare/vite-plugin"; // Removed for Vercel

export default defineConfig({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plugins: [react()], // Removed cloudflare() and mochaPlugins
  server: {
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'https://vjlvvmriqerfmztwtewa.supabase.co/functions/v1',
        changeOrigin: true,
        secure: true,
        rewrite: (path: string) => path, // Keep /api prefix
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 5000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
