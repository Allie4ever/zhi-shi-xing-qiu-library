import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { privateLibraryPlugin } from "./build/private-library-plugin";

export default defineConfig({
  root: resolve(import.meta.dirname, "pages-app"),
  base: "/zhi-shi-xing-qiu-library/",
  plugins: [react(), privateLibraryPlugin()],
  build: { outDir: resolve(import.meta.dirname, "pages-dist"), emptyOutDir: true },
});
