import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("公开页面与本地页面使用同一个React组件", async () => {
  const [entry, page, workflow, packageJson] = await Promise.all([
    readFile(new URL("pages-app/main.tsx", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL(".github/workflows/pages.yml", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
  ]);
  assert.match(entry, /import Home from "\.\.\/app\/page"/);
  assert.match(page, /IndexedDB|listLocalMaterials/);
  assert.match(page, /上传材料/);
  assert.match(page, /AI设置/);
  assert.match(page, /AI材料助手/);
  assert.match(workflow, /npm run build:pages/);
  assert.match(packageJson, /vite build --config vite\.pages\.config\.ts/);
});

test("浏览器存储、去重和PDF分页提取均为客户端实现", async () => {
  const [store, pdf, page] = await Promise.all([
    readFile(new URL("lib/browser-material-store.ts", root), "utf8"),
    readFile(new URL("lib/browser-pdf.ts", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
  ]);
  assert.match(store, /indexedDB\.open/);
  assert.match(store, /createIndex\("fileHash"/);
  assert.doesNotMatch(store + page, /localStorage|sessionStorage/);
  assert.match(pdf, /pdfjs-dist/);
  assert.match(pdf, /pageNumber/);
  assert.match(pdf, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(page, /需要OCR/);
  assert.match(page, /仅保存正文、不保存PDF原件/);
  assert.match(page, /清除浏览器数据、使用无痕模式或更换设备/);
  assert.match(store, /deletedMaterials/);
  assert.match(store, /transaction\(\[STORE_NAME, DELETED_STORE_NAME\], "readwrite"\)/);
  assert.match(page, /确定要删除《\$\{material\.title\}》吗？删除后不可恢复。/);
  assert.match(page, /deletingIdRef\.current/);
  assert.match(page, /全部年份/);
  assert.match(page, /全部月份/);
  assert.doesNotMatch(page, /开始年份|结束月份/);
});

test("11份公开初始数据不包含原件、正文、凭据或本机路径", async () => {
  const source = await readFile(new URL("data/materials-public.ts", root), "utf8");
  assert.equal((source.match(/builtIn\("built-in-/g) ?? []).length, 11);
  assert.doesNotMatch(source, /sourcePath|sourceMediaId|pdfBlob|fullText/);
  assert.doesNotMatch(source, /\/Users\/|Cookie|sk-[A-Za-z0-9_-]{12,}/);
});

test("GitHub Pages产物使用仓库子路径且不含敏感内容", async () => {
  const html = await readFile(new URL("pages-dist/index.html", root), "utf8");
  assert.match(html, /\/zhi-shi-xing-qiu-library\/assets\//);
  const assets = await readdir(new URL("pages-dist/assets/", root));
  for (const name of assets) {
    if (!/\.(js|css|mjs)$/.test(name)) continue;
    const content = await readFile(new URL(`pages-dist/assets/${name}`, root), "utf8");
    assert.doesNotMatch(content, /\/Users\/allie4ever|localhost:3001|sk-[A-Za-z0-9_-]{12,}/);
  }
});
