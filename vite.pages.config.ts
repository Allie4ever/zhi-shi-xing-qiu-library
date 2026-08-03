import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(import.meta.dirname, "pages-app"),
  base: "/zhi-shi-xing-qiu-library/",
  plugins: [react()],
  build: { outDir: resolve(import.meta.dirname, "pages-dist"), emptyOutDir: true },
});
