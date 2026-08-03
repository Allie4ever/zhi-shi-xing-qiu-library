import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("finished site metadata and PDF workflow replace the starter", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
  ]);
  assert.match(layout, /知识星球材料库/);
  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
  assert.doesNotMatch(page, /PDF 提取正文/);
  assert.match(page, /原始材料/);
  assert.match(page, /保存并开始解析/);
  assert.match(page, /重命名标题/);
  assert.match(page, /\/rename/);
  assert.match(packageJson, /"parse:pdf"/);
  assert.match(
    await readFile(new URL("scripts/local-api.mjs", root), "utf8"),
    /标题不能超过200个字符/,
  );
});

test("local persistence is private and Cloudflare storage is disabled", async () => {
  const [gitignore, hosting, parser] = await Promise.all([
    readFile(new URL(".gitignore", root), "utf8"),
    readFile(new URL(".openai/hosting.json", root), "utf8"),
    readFile(new URL("scripts/parse_pdf.py", root), "utf8"),
  ]);
  assert.match(gitignore, /\/private\//);
  assert.deepEqual(JSON.parse(hosting), { d1: null, r2: null });
  assert.match(parser, /sha256/);
  assert.match(parser, /pageNumber/);
  assert.match(parser, /needsOcr/);
  assert.match(parser, /【测试摘要｜规则生成】/);
});
