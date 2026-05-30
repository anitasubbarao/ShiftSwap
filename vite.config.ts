import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  // For GitHub Pages: set BASE_PATH=/repo-name/ at build time (the deploy
  // workflow derives this from GITHUB_REPOSITORY). Defaults to "/" for
  // local dev and root deployments.
  base: process.env.BASE_PATH || "/",
  server: {
    port: 1420,
  },
}));
