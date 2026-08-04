import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
  assert.doesNotMatch(page, /localhost自动读取本机私有资料/);
  assert.match(page, /来源：知识星球知识库/);
  assert.doesNotMatch(page, /无后端 · GitHub Pages · IndexedDB|份网站内置材料 · 本地材料仅当前浏览器可见/);
  assert.doesNotMatch(page, /upload-fields|uploadForm\.manager|uploadForm\.title|uploadForm\.materialDate/);
  assert.doesNotMatch(page, /sourceType === "private-local" \? "本机私有资料"|: "网站内置"/);
  assert.match(page, /tag !== "本机私有资料" && tag !== "网站内置"/);
  assert.match(page, /清除浏览器数据、使用无痕模式或更换设备/);
  assert.match(store, /deletedMaterials/);
  assert.match(store, /FILE_STORE_NAME = "files"/);
  assert.match(store, /transaction\(\[STORE_NAME, DELETED_STORE_NAME, FILE_STORE_NAME\], "readwrite"\)/);
  assert.match(store, /remaining\.length\) files\.delete\(hash\)/);
  assert.match(page, /补充原始文件/);
  assert.match(page, /批量导入已抓取材料/);
  assert.match(page, /SHA-256不匹配/);
  assert.match(page, /适应宽度/);
  assert.doesNotMatch(page, /程序提取的真实完整正文|暂无正文|page-text-list/);
  assert.match(page, /fullText: extracted\.pages/);
  assert.match(page, /material\.pages\?\.filter/);
  assert.match(page, /PDF加载失败/);
  assert.match(page, /尚未收录该材料的PDF原件/);
  assert.match(page, /确定要删除《\$\{material\.title\}》吗？删除后不可恢复。/);
  assert.match(page, /deletingIdRef\.current/);
  assert.match(page, /全部年份/);
  assert.match(page, /全部月份/);
  assert.doesNotMatch(page, /开始年份|结束月份/);
});

test("15份公开初始数据不包含凭据或本机路径", async () => {
  const source = await readFile(new URL("data/materials-public.ts", root), "utf8");
  assert.equal((source.match(/builtIn\("built-in-/g) ?? []).length, 15);
  assert.doesNotMatch(source, /sourcePath|sourceMediaId|pdfBlob|fullText/);
  assert.doesNotMatch(source, /\/Users\/|Cookie|sk-[A-Za-z0-9_-]{12,}/);
});

test("已确认目标PDF按哈希绑定并进入GitHub Pages产物", async () => {
  const [source, manifestText] = await Promise.all([
    readFile(new URL("data/materials-public.ts", root), "utf8"),
    readFile(new URL("data/public-pdfs.json", root), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.length, 6);
  for (const item of manifest) {
    assert.ok(["尽调报告", "路演材料"].includes(item.category));
    assert.match(source, new RegExp(item.cardId));
    assert.match(source, new RegExp(item.publicPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const pdf = await readFile(new URL(`pages-dist/${item.publicPath}`, root));
    assert.equal(pdf.byteLength, item.fileSize);
    assert.equal(createHash("sha256").update(pdf).digest("hex"), item.sha256);
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  }
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

test("localhost私有资料接口只读、限制根目录并支持Range", async () => {
  const [plugin, config, page] = await Promise.all([
    readFile(new URL("build/private-library-plugin.ts", root), "utf8"),
    readFile(new URL("vite.pages.config.ts", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
  ]);
  assert.match(config, /privateLibraryPlugin\(\)/);
  assert.match(plugin, /apply: "serve"/);
  assert.match(plugin, /target\.startsWith\(`\$\{root\}\$\{sep\}`\)/);
  assert.match(plugin, /request\.method !== "GET" && request\.method !== "HEAD"/);
  assert.match(plugin, /accept-ranges/);
  assert.match(plugin, /content-range/);
  assert.match(plugin, /record\.category !== "尽调报告" && record\.category !== "路演材料"/);
  assert.match(page, /location\.hostname === "localhost" \|\| location\.hostname === "127\.0\.0\.1"/);
  assert.match(page, /fetch\("\/api\/local-materials"\)/);
});
