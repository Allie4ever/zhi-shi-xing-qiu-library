import { readFile } from "node:fs/promises";
import { join } from "node:path";

const STOP_WORDS = new Set([
  "哪些", "什么", "怎么", "如何", "主要", "材料", "材料库", "采用", "相关",
  "进行", "对比", "介绍", "以及", "一个", "中的", "the", "and", "for",
]);

function normalizedText(value = "") {
  return String(value).toLowerCase().replace(/\s+/g, " ").trim();
}

export function tokenize(value) {
  const text = normalizedText(value);
  const tokens = new Set();
  for (const match of text.matchAll(/[a-z0-9][a-z0-9+._-]{1,}|[\u3400-\u9fff]{2,}/g)) {
    const term = match[0];
    if (/^[\u3400-\u9fff]+$/.test(term)) {
      if (term.length <= 8 && !STOP_WORDS.has(term)) tokens.add(term);
      for (let index = 0; index < term.length - 1; index += 1) {
        const gram = term.slice(index, index + 2);
        if (!STOP_WORDS.has(gram)) tokens.add(gram);
      }
    } else if (!STOP_WORDS.has(term)) {
      tokens.add(term);
    }
  }
  return tokens;
}

function splitText(text, maxChars = 1400) {
  const compact = String(text || "").replace(/\u0000/g, " ").trim();
  if (!compact) return [];
  const paragraphs = compact.split(/\n{2,}|(?<=[。！？])\s+/).filter(Boolean);
  const chunks = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 1 > maxChars) {
      chunks.push(current);
      current = "";
    }
    if (paragraph.length > maxChars) {
      for (let start = 0; start < paragraph.length; start += maxChars) {
        const part = paragraph.slice(start, start + maxChars);
        if (current) chunks.push(current);
        current = part;
      }
    } else {
      current = current ? `${current}\n${paragraph}` : paragraph;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function buildChunks(materials) {
  const chunks = [];
  for (const material of materials) {
    const base = {
      materialId: material.id,
      route: material.route,
      title: material.title,
      manager: material.manager,
    };
    if (Array.isArray(material.pages) && material.pages.some((page) => page.text?.trim())) {
      for (const page of material.pages) {
        splitText(page.text).forEach((text, index) => chunks.push({
          ...base,
          chunkId: `${material.id}-p${page.pageNumber}-${index + 1}`,
          pageNumber: page.pageNumber,
          paragraphLabel: null,
          text,
        }));
      }
      continue;
    }
    const sections = [
      ["概要", material.summary],
      ...((material.highlights || []).map((text, index) => [`重点${index + 1}`, text])),
      ...((material.risks || []).map((text, index) => [`风险${index + 1}`, text])),
    ];
    for (const [label, text] of sections) {
      if (!text) continue;
      chunks.push({
        ...base,
        chunkId: `${material.id}-${label}`,
        pageNumber: null,
        paragraphLabel: label,
        text,
      });
    }
  }
  return chunks;
}

export function searchChunks(chunks, question, { scope = "all", currentMaterialId = null, limit = 8 } = {}) {
  const queryTokens = tokenize(question);
  if (!queryTokens.size) return [];
  const normalizedQuestion = normalizedText(question);
  const scored = [];
  for (const chunk of chunks) {
    if (scope === "due-diligence" && chunk.route !== "due-diligence") continue;
    if (scope === "manager-materials" && chunk.route !== "manager-materials") continue;
    if (scope === "current" && chunk.materialId !== currentMaterialId) continue;
    const searchable = `${chunk.manager} ${chunk.title} ${chunk.text}`;
    const documentTokens = tokenize(searchable);
    let score = 0;
    for (const token of queryTokens) {
      if (documentTokens.has(token)) score += token.length > 2 ? 3 : 1;
    }
    const manager = normalizedText(chunk.manager);
    const title = normalizedText(chunk.title);
    const managerRoot = manager.replace(/(私募基金|私募|基金|投资|资产)$/u, "");
    const managerAliases = [managerRoot, managerRoot.replace(/^(北京|上海|深圳|杭州|广州)/u, "")].filter((alias) => alias.length >= 2);
    const managerMatched = managerAliases.some((alias) => normalizedQuestion.includes(alias));
    if (managerMatched) score += 12;
    if (title && normalizedQuestion.includes(title)) score += 8;
    if (/\b风险\b|风险|隐患|回撤/.test(normalizedQuestion) && chunk.paragraphLabel?.startsWith("风险")) score += 6;
    if (/量化股票/.test(normalizedQuestion) && /量化股票/.test(searchable)) score += 7;
    if (score > 0) scored.push({ ...chunk, score, managerMatched });
  }
  scored.sort((left, right) => right.score - left.score || left.chunkId.localeCompare(right.chunkId));

  const hasExplicitManager = scored.some((chunk) => chunk.managerMatched);
  const topScore = scored[0]?.score || 0;
  const eligible = scored.filter((chunk) => {
    if (hasExplicitManager) return chunk.managerMatched;
    return chunk.score >= Math.max(2, topScore * 0.25);
  });

  const selected = [];
  const perMaterial = new Map();
  const perMaterialLimit = /(哪些|谁|列出|有哪些)/.test(normalizedQuestion)
    ? 1
    : hasExplicitManager && /(风险|隐患|回撤)/.test(normalizedQuestion)
      ? 3
      : 2;
  for (const chunk of eligible) {
    const used = perMaterial.get(chunk.materialId) || 0;
    if (used >= perMaterialLimit) continue;
    selected.push(chunk);
    perMaterial.set(chunk.materialId, used + 1);
    if (selected.length >= limit) break;
  }
  return selected;
}

export async function loadLibraryMaterials(root) {
  const curated = JSON.parse(await readFile(join(root, "data", "materials-curated.json"), "utf8")).materials;
  let local = [];
  try {
    local = JSON.parse(await readFile(join(root, "private", "data", "materials.json"), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return [...local, ...curated];
}
