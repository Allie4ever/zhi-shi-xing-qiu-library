import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createAiSessionStore } from "../scripts/ai-session.mjs";
import { buildChunks, searchChunks } from "../scripts/material-retrieval.mjs";

const root = new URL("../", import.meta.url);
const curated = JSON.parse(await readFile(new URL("data/materials-curated.json", root), "utf8")).materials;
const chunks = buildChunks(curated);

test("现有6份材料的三个测试问题都能检索到可点击依据", () => {
  assert.equal(curated.length, 6);

  const quant = searchChunks(chunks, "哪些管理人采用量化股票策略？", { limit: 10 });
  const quantManagers = new Set(quant.map((item) => item.manager));
  assert.ok(quantManagers.has("深圳安子私募基金"));
  assert.ok(quantManagers.has("榕树海私募基金"));
  assert.ok(!quantManagers.has("杭州孚盈投资"));

  const anzi = searchChunks(chunks, "安子私募的主要风险是什么？", { limit: 6 });
  assert.equal(anzi[0].manager, "深圳安子私募基金");
  assert.match(anzi[0].paragraphLabel, /^风险/);

  const comparison = searchChunks(chunks, "对比平凡与榕树海的策略特点。", { limit: 8 });
  const comparisonManagers = new Set(comparison.map((item) => item.manager));
  assert.ok(comparisonManagers.has("北京平凡私募基金"));
  assert.ok(comparisonManagers.has("榕树海私募基金"));
});

test("API Key只留在本地后端内存，不出现在设置响应或项目文件", async () => {
  const secret = "local-test-secret-123456789";
  const store = createAiSessionStore();
  const publicSettings = store.save({
    provider: "openai-compatible",
    baseUrl: "https://api.example.invalid/v1",
    model: "test-model",
    apiKey: secret,
  });
  const responseText = JSON.stringify(publicSettings);
  assert.doesNotMatch(responseText, new RegExp(secret));
  assert.doesNotMatch(responseText, /apiKey/);
  assert.match(responseText, /keyMask/);

  const sourceFiles = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("scripts/local-api.mjs", root), "utf8"),
    readFile(new URL("scripts/ai-session.mjs", root), "utf8"),
  ]);
  for (const source of sourceFiles) {
    assert.doesNotMatch(source, new RegExp(secret));
  }
  assert.deepEqual(store.clear(), {
    configured: false,
    provider: "openai-compatible",
    baseUrl: "",
    model: "",
    keyMask: "",
  });
});
