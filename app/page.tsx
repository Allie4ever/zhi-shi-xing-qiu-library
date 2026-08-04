"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { builtInMaterials } from "../data/materials-public";
import { extractPdfPages, MAX_PDF_SIZE, sha256 } from "../lib/browser-pdf";
import {
  deleteMaterialPersistently, deleteMaterialRecord, ensureStorageCapacity, findLocalMaterialByHash,
  getLocalMaterial, getStoredPdf, listDeletedMaterialIds, listLocalMaterials, saveLocalMaterial, savePdfAndMaterial,
} from "../lib/browser-material-store";
import type { Material, Route, Status } from "../lib/material-types";
import { filterAndSortMaterials, parseMaterialDate } from "../lib/material-query";

type AiScope = "all" | Route | "current";
type Citation = { materialId: string; title: string; manager: string; pageNumber: number | null; paragraphLabel: string; excerpt: string };
type ChatMessage = { id: string; role: "user" | "assistant"; content: string; citations?: Citation[] };
type CrawledMetadata = {
  original_filename: string; post_title?: string; pdf_title?: string; posted_at?: string;
  file_id?: string | null; sha256?: string; category: string; classification_basis?: string;
  page_count?: number; file_size_bytes?: number; pages_file?: string;
};

const tabs: { id: Route; label: string; hint: string }[] = [
  { id: "due-diligence", label: "尽调报告", hint: "访谈、现场与完整尽调" },
  { id: "manager-materials", label: "路演材料", hint: "管理人介绍、策略与产品材料" },
];
const statusOptions: Status[] = ["待解析", "待复核", "已发布", "解析失败"];

function displayDate(value: string) {
  const parts = value.split("-");
  if (parts.length === 2) return `${parts[0]}年${Number(parts[1])}月`;
  if (parts.length === 3) return `${parts[0]}年${Number(parts[1])}月${Number(parts[2])}日`;
  return value;
}

function safeError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (/quota|space|storage/i.test(message)) return "浏览器存储空间不足，请先导出备份并删除部分本地材料。";
  return message.replace(/Bearer\s+\S+/gi, "Bearer [已隐藏]").replace(/sk-[A-Za-z0-9_-]+/g, "[API Key已隐藏]");
}

function buildCitations(materials: Material[], question: string, scope: AiScope, currentId: string | null) {
  const terms = question.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  const candidates = materials.filter((item) => scope === "all" || (scope === "current" ? item.id === currentId : item.route === scope));
  return candidates.flatMap((material) => {
    const pageChunks = material.pages?.filter((page) => page.text.trim()).map((page) => ({ text: page.text, pageNumber: page.pageNumber, label: `PDF第${page.pageNumber}页` })) ?? [];
    const manual = [
      ...(material.highlights ?? []).map((text, index) => ({ text, pageNumber: null, label: `核心重点${index + 1}` })),
      ...(material.risks ?? []).map((text, index) => ({ text, pageNumber: null, label: `风险${index + 1}` })),
      ...(material.summary && material.summary !== "待人工整理" ? [{ text: material.summary, pageNumber: null, label: "人工概要" }] : []),
    ];
    return [...pageChunks, ...manual].map((chunk) => {
      const haystack = `${material.manager} ${material.title} ${material.strategy} ${material.tags.join(" ")} ${chunk.text}`.toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 2 : 0), 0) + (haystack.includes(question.toLowerCase()) ? 5 : 0);
      return { material, chunk, score };
    });
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 6).map(({ material, chunk }) => ({
    materialId: material.id, title: material.title, manager: material.manager,
    pageNumber: chunk.pageNumber, paragraphLabel: chunk.label, excerpt: chunk.text.slice(0, 320),
  } satisfies Citation));
}

function PdfViewer({ material, onReplace }: { material: Material; onReplace: () => void }) {
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState("page-width");
  const [reloadToken, setReloadToken] = useState(0);
  const [loadState, setLoadState] = useState<{ status: "loading" | "ready" | "error"; message?: string }>({ status: "loading" });
  const total = Math.max(1, material.totalPages ?? 1);
  const src = `${material.pdfUrl}#page=${page}&zoom=${zoom}&toolbar=1&navpanes=0`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(material.pdfUrl!, { headers: { Range: "bytes=0-0" }, signal: controller.signal }).then(async (response) => {
      if (!response.ok) {
        let detail = `${response.status} ${response.statusText}`;
        try { detail = (await response.json()).error || detail; } catch { /* PDF responses are not JSON. */ }
        throw new Error(detail);
      }
      setLoadState({ status: "ready" });
    }).catch((error) => { if (error instanceof DOMException && error.name === "AbortError") return; setLoadState({ status: "error", message: error instanceof Error ? error.message : "未知错误" }); });
    return () => controller.abort();
  }, [material.pdfUrl, reloadToken]);
  return <section className="pdf-panel">
    <div className="pdf-toolbar"><div><span className="pdf-badge">PDF</span><div><h3>原始材料</h3><p>{material.originalFileName || material.fileName} · {material.fileSize ? `${(material.fileSize / 1024).toFixed(1)} KB` : "大小未知"} · {material.totalPages ?? "?"}页</p></div></div><div className="pdf-actions">
      <button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</button>
      <label>第 <input aria-label="PDF页码" type="number" min="1" max={total} value={page} onChange={(event) => setPage(Math.min(total, Math.max(1, Number(event.target.value) || 1)))} /> / {total} 页</label>
      <button disabled={page >= total} onClick={() => setPage((value) => Math.min(total, value + 1))}>下一页</button>
      <select aria-label="PDF缩放" value={zoom} onChange={(event) => setZoom(event.target.value)}><option value="page-width">适应宽度</option><option value="75">75%</option><option value="100">100%</option><option value="125">125%</option><option value="150">150%</option></select>
      {material.sourceType !== "private-local" && <button onClick={onReplace}>重新选择文件</button>}<a href={material.pdfUrl} target="_blank" rel="noreferrer">在新窗口打开</a>
    </div></div>
    {loadState.status === "loading" && <div className="pdf-loading">正在读取PDF原件…</div>}
    {loadState.status === "error" && <div className="pdf-load-error"><strong>PDF加载失败</strong><p>{loadState.message}</p><button onClick={() => { setLoadState({ status: "loading" }); setReloadToken((value) => value + 1); }}>重新加载</button></div>}
    {loadState.status === "ready" && <iframe title={`${material.title} PDF 预览`} src={src} loading="lazy" onError={() => setLoadState({ status: "error", message: "浏览器无法显示该PDF，请重新加载或在新窗口打开。" })} />}
  </section>;
}

function MaterialCard({ material, open, onToggle, onRename, onStatus, onDelete, onAttach, deleting }: {
  material: Material; open: boolean; onToggle: () => void; onRename: () => void;
  onStatus: () => void; onDelete: () => void; onAttach: () => void; deleting: boolean;
}) {
  return <article id={`material-${material.id}`} className={`material-card ${open ? "is-open" : ""}`}>
    <div className="card-summary" role="button" tabIndex={0} aria-expanded={open} onClick={onToggle} onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onToggle(); }
    }}>
      <div className="card-date"><span>{material.materialDate?.slice(0, 4) || "日期"}</span><strong>{material.materialDate?.slice(5).replace("-", ".") || "未知"}</strong><button className="card-delete" type="button" disabled={deleting} aria-label={`删除《${material.title}》`} title={deleting ? "正在删除" : "删除材料"} onClick={(event) => { event.stopPropagation(); onDelete(); }}>{deleting ? <span className="delete-loading">…</span> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" /></svg>}</button></div>
      <div className="card-main">
        <div className="eyebrow-row"><span className="manager">{material.manager}</span><span className={`status status-${material.status}`}>{material.status}</span><span className={`source-badge source-${material.sourceType}`}>{material.sourceType === "local" ? "浏览器临时导入" : material.sourceType === "private-local" ? "本机私有资料" : "网站内置"}</span></div>
        <div className="title-row"><h2>{material.title}</h2>{material.sourceType === "local" && <button className="rename-button" aria-label="重命名标题" title="重命名标题" onClick={(event) => { event.stopPropagation(); onRename(); }}>✎</button>}</div>
        <div className="meta-row"><span>{material.strategy || "待人工整理"}</span><span>{displayDate(material.materialDate)}</span>{(material.pdfUrl || material.pdfBlob) && <span className="pdf-mark">PDF</span>}</div>
        <p className="summary">{material.summary?.trim() || "待人工整理"}</p>
        <div className="tag-row">{material.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>
      </div>
      <span className="expand-control"><span>{open ? "收起" : "查看详情"}</span><i>{open ? "−" : "+"}</i></span>
    </div>
    {open && <div className="card-detail">
      {(material.postTitle || material.postedAt || material.groupName) && <section className="record-audit record-source-only">
        <div><strong>原帖信息</strong><p>{material.postTitle || material.title} · {material.postedAt ? new Date(material.postedAt).toLocaleString("zh-CN") : "时间未知"} · {material.groupName || "来源未知"}</p></div>
      </section>}
      {material.sourceType === "local" && <section className="record-audit record-actions-only"><div className="record-actions"><button onClick={onStatus}>{material.status === "已发布" ? "改为待复核" : "标记已发布"}</button></div></section>}
      {material.pdfUrl ? <PdfViewer material={material} onReplace={onAttach} /> : <section className="pdf-panel"><div className="pdf-toolbar"><div><span className="pdf-badge">PDF</span><div><h3>原始材料</h3></div></div></div><div className="pdf-placeholder"><div className="pdf-sheet">PDF</div><div><strong>尚未收录该材料的PDF原件。</strong>{material.sourceType !== "private-local" && <button className="attach-file" onClick={onAttach}>补充原始文件</button>}</div></div></section>}
    </div>}
  </article>;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<Route>("due-diligence");
  const [localMaterials, setLocalMaterials] = useState<Material[]>([]);
  const [privateMaterials, setPrivateMaterials] = useState<Material[]>([]);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<Status | "全部">("全部");
  const [query, setQuery] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deletingIdRef = useRef<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadForm, setUploadForm] = useState({ route: "due-diligence" as Route, manager: "", title: "", materialDate: new Date().toISOString().slice(0, 10), savePdf: true });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const attachTargetRef = useRef<Material | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchMetadata, setBatchMetadata] = useState<File | null>(null);
  const [batchPdfs, setBatchPdfs] = useState<File[]>([]);
  const [batchPages, setBatchPages] = useState<File[]>([]);
  const objectUrls = useRef<string[]>([]);

  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [aiForm, setAiForm] = useState({ provider: "openai-compatible", baseUrl: "https://api.openai.com/v1", model: "", apiKey: "" });
  const [aiConfigured, setAiConfigured] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const aiSession = useRef({ baseUrl: "", model: "", apiKey: "" });
  const [chatScope, setChatScope] = useState<AiScope>("all");
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);

  const hydrate = async () => {
    const [records, persistedDeletedIds] = await Promise.all([listLocalMaterials(), listDeletedMaterialIds()]);
    objectUrls.current.forEach(URL.revokeObjectURL);
    objectUrls.current = [];
    const withUrls = await Promise.all(records.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")).map(async (item) => {
      const stored = item.fileHash ? await getStoredPdf(item.fileHash) : undefined;
      const blob = stored?.blob ?? item.pdfBlob;
      if (!blob) return item;
      const pdfUrl = URL.createObjectURL(blob);
      objectUrls.current.push(pdfUrl);
      return { ...item, pdfUrl, fileName: item.fileName ?? stored?.fileName, fileSize: item.fileSize ?? stored?.size, pdfBlob: undefined };
    }));
    setLocalMaterials(withUrls);
    setDeletedIds(new Set(persistedDeletedIds));
    setLoaded(true);
  };

  useEffect(() => {
    hydrate().catch((error) => setNotice({ kind: "error", text: safeError(error, "无法读取浏览器材料库") }));
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
      fetch("/api/local-materials").then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error || "本机资料索引读取失败");
        return response.json() as Promise<Material[]>;
      }).then((records) => setPrivateMaterials(records.map((record) => {
        const builtIn = builtInMaterials.find((item) => item.expectedSha256 === record.fileHash);
        return builtIn ? { ...builtIn, ...record, id: builtIn.id, manager: builtIn.manager, strategy: builtIn.strategy, tags: Array.from(new Set([...builtIn.tags, ...record.tags])), pdfUrl: builtIn.pdfUrl ?? record.pdfUrl, sourceType: builtIn.pdfUrl ? "built-in" : record.sourceType } : record;
      }))).catch((error) => setNotice({ kind: "error", text: safeError(error, "本机资料索引读取失败") }));
    }
    return () => objectUrls.current.forEach(URL.revokeObjectURL);
  }, []);

  const materials = useMemo(() => {
    const merged = new Map(builtInMaterials.map((material) => [material.id, material]));
    const privateHashes = new Set(privateMaterials.map((item) => item.fileHash).filter(Boolean));
    for (const local of localMaterials) if (!local.fileHash || !privateHashes.has(local.fileHash)) merged.set(local.id, { ...(merged.get(local.id) ?? {}), ...local } as Material);
    for (const localPrivate of privateMaterials) merged.set(localPrivate.id, { ...(merged.get(localPrivate.id) ?? {}), ...localPrivate } as Material);
    return Array.from(merged.values()).filter((material) => !deletedIds.has(material.id));
  }, [localMaterials, privateMaterials, deletedIds]);

  async function toggleMaterial(material: Material) {
    if (openId === material.id) { setOpenId(null); return; }
    setOpenId(material.id);
    if (material.pages || !material.pagesUrl) return;
    try {
      const response = await fetch(material.pagesUrl);
      if (!response.ok) throw new Error((await response.json()).error || "分页正文读取失败");
      const raw = await response.json() as Array<{ page?: number; pageNumber?: number; text?: string }>;
      const pages = raw.map((item, index) => ({ pageNumber: item.pageNumber ?? item.page ?? index + 1, text: item.text ?? "", charCount: (item.text ?? "").length }));
      setPrivateMaterials((items) => items.map((item) => item.id === material.id ? { ...item, pages, totalPages: item.totalPages ?? pages.length, totalChars: pages.reduce((sum, page) => sum + page.charCount, 0), needsOcr: pages.reduce((sum, page) => sum + page.charCount, 0) < 20 } : item));
    } catch (error) { setNotice({ kind: "error", text: safeError(error, "正文待补充") }); }
  }
  const filtered = useMemo(() => filterAndSortMaterials(materials, { route: activeTab, status: statusFilter, query, selectedYear, selectedMonth }), [materials, activeTab, statusFilter, query, selectedYear, selectedMonth]);
  const counts = useMemo(() => Object.fromEntries(statusOptions.map((status) => [status, materials.filter((item) => item.route === activeTab && item.status === status).length])) as Record<Status, number>, [materials, activeTab]);
  const availableYears = useMemo(() => Array.from(new Set(materials.map((item) => parseMaterialDate(item.materialDate)?.year).filter((year): year is number => Boolean(year)))).sort((left, right) => right - left), [materials]);

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) return setNotice({ kind: "error", text: "只能导入PDF文件。" });
    if (file.size > MAX_PDF_SIZE) return setNotice({ kind: "error", text: "单个PDF最大20MB，请压缩或拆分后重试。" });
    setSelectedFile(file);
    setUploadForm((form) => ({ ...form, title: form.title || file.name.replace(/\.pdf$/i, "") }));
  }

  async function bindPdfToMaterial(material: Material, file: File, suppliedPages?: Material["pages"]) {
    if (!file.name.toLowerCase().endsWith(".pdf")) throw new Error("只能绑定PDF文件。");
    if (file.size > MAX_PDF_SIZE) throw new Error("单个PDF最大20MB。");
    const fileHash = await sha256(file);
    if (material.expectedSha256 && fileHash !== material.expectedSha256) throw new Error(`SHA-256不匹配，已停止绑定。当前卡片要求的原件为：${material.originalFileName ?? material.title}`);
    if (!material.expectedSha256) {
      const expectedName = (material.originalFileName ?? `${material.title}.pdf`).normalize("NFKC").toLowerCase();
      if (file.name.normalize("NFKC").toLowerCase() !== expectedName && !confirm(`文件名与卡片记录不完全一致。仍要将“${file.name}”绑定到《${material.title}》吗？`)) throw new Error("文件匹配存在歧义，已取消绑定。");
    }
    const duplicate = await findLocalMaterialByHash(fileHash);
    if (duplicate?.id === material.id && material.pdfUrl) throw new Error("当前卡片已绑定同一PDF，无需重复操作。");
    await ensureStorageCapacity(file.size * 1.3);
    const extracted = suppliedPages ? { pages: suppliedPages, totalChars: suppliedPages.reduce((sum, item) => sum + item.charCount, 0), needsOcr: suppliedPages.reduce((sum, item) => sum + item.charCount, 0) < 20 } : await extractPdfPages(file);
    const now = new Date().toISOString();
    const bound: Material = {
      ...material, fileName: file.name, originalFileName: material.originalFileName ?? file.name, fileHash, fileSize: file.size,
      localFileKey: fileHash, locallyBound: true, savePdf: true, needsOcr: extracted.needsOcr, pages: extracted.pages,
      fullText: extracted.pages.map((item) => `第${item.pageNumber}页\n${item.text}`).join("\n\n"), totalPages: extracted.pages.length,
      totalChars: extracted.totalChars, updatedAt: now, createdAt: material.createdAt ?? now,
    };
    await savePdfAndMaterial(bound, { hash: fileHash, blob: file, fileName: file.name, size: file.size, createdAt: now });
    if (duplicate && duplicate.id !== material.id && duplicate.sourceType === "local") await deleteMaterialRecord(duplicate.id);
    await hydrate();
    return bound;
  }

  function chooseAttachment(material: Material) {
    attachTargetRef.current = material;
    if (attachInputRef.current) { attachInputRef.current.value = ""; attachInputRef.current.click(); }
  }

  async function handleAttachment(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; const target = attachTargetRef.current;
    if (!file || !target) return;
    setNotice(null);
    try {
      const bound = await bindPdfToMaterial(target, file);
      setOpenId(bound.id); setActiveTab(bound.route);
      setNotice({ kind: bound.needsOcr ? "error" : "success", text: bound.needsOcr ? "PDF已绑定，但没有可提取文字，已标记为需要OCR。" : `原始PDF已绑定到《${bound.title}》，共${bound.totalPages}页。` });
    } catch (error) { setNotice({ kind: "error", text: safeError(error, "补充原始文件失败") }); }
  }

  async function importCrawledBatch() {
    if (!batchMetadata || !batchPdfs.length) return;
    setBatchBusy(true); setNotice(null);
    try {
      const metadata = JSON.parse(await batchMetadata.text()) as CrawledMetadata[];
      if (!Array.isArray(metadata)) throw new Error("元数据JSON格式无效。");
      const allowed = metadata.filter((item) => item.category === "尽调报告" || item.category === "路演材料");
      let imported = 0; let duplicates = 0; let skipped = metadata.length - allowed.length;
      for (const item of allowed) {
        const pdf = batchPdfs.find((file) => file.name.normalize("NFKC") === item.original_filename.normalize("NFKC"));
        if (!pdf) { skipped += 1; continue; }
        const actualHash = await sha256(pdf);
        if (item.sha256 && actualHash !== item.sha256) throw new Error(`《${item.original_filename}》哈希与元数据不一致，已停止批量导入。`);
        const pageName = item.pages_file?.split("/").pop();
        const pageFile = pageName ? batchPages.find((file) => file.name.normalize("NFKC") === pageName.normalize("NFKC")) : undefined;
        let pages: Material["pages"];
        if (pageFile) {
          const raw = JSON.parse(await pageFile.text()) as Array<{ page?: number; pageNumber?: number; text?: string }>;
          pages = raw.map((entry, index) => ({ pageNumber: entry.pageNumber ?? entry.page ?? index + 1, text: entry.text ?? "", charCount: (entry.text ?? "").length }));
        }
        const route: Route = item.category === "尽调报告" ? "due-diligence" : "manager-materials";
        const exactHashTarget = materials.find((candidate) => candidate.expectedSha256 === actualHash || candidate.fileHash === actualHash);
        const exactFileIdTarget = item.file_id ? materials.find((candidate) => candidate.fileId === item.file_id) : undefined;
        const combinationTargets = materials.filter((candidate) => candidate.route === route && candidate.title.normalize("NFKC") === (item.pdf_title ?? item.post_title ?? "").normalize("NFKC") && candidate.materialDate === item.posted_at?.slice(0, 10));
        if (!exactHashTarget && !exactFileIdTarget && combinationTargets.length > 1) throw new Error(`《${item.original_filename}》匹配到多张卡片，已停止自动绑定，请逐份确认。`);
        const target = exactHashTarget ?? exactFileIdTarget ?? combinationTargets[0] ?? ({
          id: `local-${crypto.randomUUID()}`, route, manager: "待人工整理", title: item.pdf_title ?? item.post_title ?? item.original_filename.replace(/\.pdf$/i, ""),
          materialDate: item.posted_at?.slice(0, 10) ?? "", materialType: item.category, strategy: "待人工整理", summary: "待人工整理",
          highlights: [], risks: [], tags: ["本地批量导入"], status: "待复核", sourceType: "local", originalFileName: item.original_filename,
          expectedSha256: item.sha256, postTitle: item.post_title, postedAt: item.posted_at, fileId: item.file_id ?? undefined,
        } satisfies Material);
        if (target.fileHash === actualHash && target.pdfUrl) { duplicates += 1; continue; }
        await bindPdfToMaterial(target, pdf, pages); imported += 1;
      }
      setBatchOpen(false); setBatchMetadata(null); setBatchPdfs([]); setBatchPages([]); setActiveTab("manager-materials");
      setNotice({ kind: "success", text: `批量导入完成：成功${imported}份，重复${duplicates}份，跳过${skipped}份。` });
    } catch (error) { setNotice({ kind: "error", text: safeError(error, "批量导入失败") }); } finally { setBatchBusy(false); }
  }

  async function importPdf() {
    if (!selectedFile || !uploadForm.manager.trim() || !uploadForm.title.trim()) return;
    setUploading(true); setNotice(null);
    try {
      const fileHash = await sha256(selectedFile);
      const duplicate = await findLocalMaterialByHash(fileHash);
      if (duplicate) throw new Error(`检测到重复文件，已有记录：${duplicate.title}`);
      await ensureStorageCapacity((uploadForm.savePdf ? selectedFile.size : 0) + selectedFile.size * 0.3);
      const extracted = await extractPdfPages(selectedFile);
      const now = new Date().toISOString();
      const material: Material = {
        id: `local-${crypto.randomUUID()}`, route: uploadForm.route, manager: uploadForm.manager.trim(), title: uploadForm.title.trim(),
        materialDate: uploadForm.materialDate, materialType: uploadForm.route === "due-diligence" ? "尽调报告" : "路演材料",
        strategy: "待人工整理", summary: "待人工整理", highlights: [], risks: [], tags: extracted.needsOcr ? ["本地上传", "需要OCR"] : ["本地上传"],
        status: "待复核", sourceType: "local", fileName: selectedFile.name, originalFileName: selectedFile.name, fileHash, fileSize: selectedFile.size, localFileKey: fileHash, needsOcr: extracted.needsOcr,
        pages: extracted.pages, fullText: extracted.pages.map((page) => `第${page.pageNumber}页\n${page.text}`).join("\n\n"),
        totalPages: extracted.pages.length, totalChars: extracted.totalChars, savePdf: uploadForm.savePdf, createdAt: now, updatedAt: now,
      };
      if (uploadForm.savePdf) await savePdfAndMaterial(material, { hash: fileHash, blob: selectedFile, fileName: selectedFile.name, size: selectedFile.size, createdAt: now });
      else await saveLocalMaterial(material);
      await hydrate();
      setActiveTab(material.route); setStatusFilter("全部"); setOpenId(material.id); setUploadOpen(false); setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setNotice({ kind: extracted.needsOcr ? "error" : "success", text: extracted.needsOcr ? "PDF已保存，但未提取到有效文字，已标记为需要OCR。" : `本地导入完成：${material.totalPages}页、${material.totalChars?.toLocaleString()}字符。` });
    } catch (error) { setNotice({ kind: "error", text: safeError(error, "PDF导入失败") }); } finally { setUploading(false); }
  }

  async function updateMaterial(material: Material, changes: Partial<Material>) {
    const stored = await getLocalMaterial(material.id);
    const base = stored ?? material;
    await saveLocalMaterial({ ...base, ...changes, updatedAt: new Date().toISOString() }); await hydrate();
  }

  async function renameMaterial(material: Material) {
    const title = prompt("请输入新的材料标题", material.title)?.trim(); if (!title || title === material.title) return;
    try { await updateMaterial(material, { title }); setNotice({ kind: "success", text: "标题已更新并保存在当前浏览器。" }); } catch (error) { setNotice({ kind: "error", text: safeError(error, "重命名失败") }); }
  }

  async function removeMaterial(material: Material) {
    if (deletingIdRef.current) return;
    if (!confirm(`确定要删除《${material.title}》吗？删除后不可恢复。`)) return;
    deletingIdRef.current = material.id;
    setDeletingId(material.id);
    setNotice(null);
    try {
      await deleteMaterialPersistently(material.id);
      if (openId === material.id) setOpenId(null);
      await hydrate();
      setNotice({ kind: "success", text: `《${material.title}》已删除。` });
    } catch (error) {
      setNotice({ kind: "error", text: safeError(error, `《${material.title}》删除失败，原卡片已保留。`) });
    } finally {
      deletingIdRef.current = null;
      setDeletingId(null);
    }
  }

  async function callAi(messages: { role: string; content: string }[], maxTokens = 700) {
    const { baseUrl, model, apiKey } = aiSession.current;
    if (!apiKey || !baseUrl || !model) throw new Error("请先完整配置AI API。 ");
    const controller = new AbortController(); const timer = window.setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, { method: "POST", signal: controller.signal, headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.1 }) });
      if (!response.ok) { if (response.status === 401 || response.status === 403) throw new Error("API Key无效或无权限。 "); if (response.status === 429) throw new Error("AI服务额度不足或请求受限。 "); throw new Error("AI接口暂时不可用。 "); }
      const result = await response.json(); return String(result.choices?.[0]?.message?.content ?? "").trim();
    } catch (error) { if (error instanceof DOMException && error.name === "AbortError") throw new Error("AI接口请求超时。 "); throw error; } finally { clearTimeout(timer); }
  }

  function saveAiSettings() {
    if (!aiForm.baseUrl.trim() || !aiForm.model.trim() || !aiForm.apiKey.trim()) return setAiFeedback({ kind: "error", text: "请完整填写API地址、模型名称和API Key。" });
    aiSession.current = { baseUrl: aiForm.baseUrl.trim(), model: aiForm.model.trim(), apiKey: aiForm.apiKey.trim() };
    setAiConfigured(true); setAiForm((form) => ({ ...form, apiKey: "" })); setAiFeedback({ kind: "success", text: "设置仅保存在当前页面内存中，刷新或关闭页面后会清除。" });
  }

  async function testAi() {
    if (aiForm.apiKey.trim()) saveAiSettings();
    setAiBusy(true); setAiFeedback(null);
    try { await callAi([{ role: "user", content: "只回复：连接成功" }], 20); setAiFeedback({ kind: "success", text: "连接成功。" }); } catch (error) { setAiFeedback({ kind: "error", text: safeError(error, "连接失败") }); } finally { setAiBusy(false); }
  }

  async function sendQuestion() {
    const question = chatQuestion.trim(); if (!question || chatBusy) return;
    if (!aiConfigured) { setAiSettingsOpen(true); setAiFeedback({ kind: "error", text: "请先配置AI API。" }); return; }
    const citations = buildCitations(materials, question, chatScope, openId);
    setChatMessages((items) => [...items, { id: crypto.randomUUID(), role: "user", content: question }]); setChatQuestion("");
    if (!citations.length) { setChatMessages((items) => [...items, { id: crypto.randomUUID(), role: "assistant", content: "当前材料库中没有足够信息" }]); return; }
    setChatBusy(true);
    try {
      const context = citations.map((item, index) => `[依据${index + 1}] ${item.title}｜${item.manager}｜${item.paragraphLabel}\n${item.excerpt}`).join("\n\n");
      const answer = await callAi([{ role: "system", content: "你是材料库助手。只能依据给定片段回答；不能推断或编造。信息不足时只回答“当前材料库中没有足够信息”。回答中用[依据1]格式标注引用。" }, ...chatMessages.slice(-6).map(({ role, content }) => ({ role, content })), { role: "user", content: `问题：${question}\n\n${context}` }]);
      setChatMessages((items) => [...items, { id: crypto.randomUUID(), role: "assistant", content: answer || "当前材料库中没有足够信息", citations }]);
    } catch (error) { setChatMessages((items) => [...items, { id: crypto.randomUUID(), role: "assistant", content: safeError(error, "AI问答失败") }]); } finally { setChatBusy(false); }
  }

  function openCitation(citation: Citation) { const material = materials.find((item) => item.id === citation.materialId); if (!material) return; setActiveTab(material.route); setStatusFilter("全部"); setQuery(""); setOpenId(material.id); setAssistantOpen(false); setTimeout(() => document.getElementById(`material-${material.id}`)?.scrollIntoView({ behavior: "smooth" }), 80); }
  const currentTab = tabs.find((tab) => tab.id === activeTab)!;

  return <main>
    <header className="topbar"><a className="brand" href="#"><span className="brand-mark">知</span><span><strong>知识星球材料库</strong><small>PRIVATE FUND RESEARCH LIBRARY</small></span></a><div className="header-actions"><span className="local-pill"><i /> 浏览器本地模式</span><button className="ai-entry" onClick={() => setAiSettingsOpen(true)}><span className={aiConfigured ? "is-ready" : ""} /> AI设置</button><button className="assistant-entry" onClick={() => setAssistantOpen(true)}>✦ AI材料助手</button><button className="upload-button" onClick={() => setUploadOpen(true)}><span>＋</span> 上传材料</button></div></header>
    <div className="workspace">
      {notice && <div className={`notice notice-${notice.kind}`} role="status">{notice.text}</div>}
      <div className="privacy-warning">本地上传材料仅保存在当前浏览器。清除浏览器数据、使用无痕模式或更换设备可能导致材料丢失。</div>
      <section className="hero"><div><p className="kicker">RESEARCH ARCHIVE / 研究档案</p><h1>把每一份材料，<em>变成可验证的判断。</em></h1><p className="hero-copy">localhost自动读取本机私有资料；浏览器临时导入与网站内置索引合并展示，私有文件不会上传GitHub或云端。</p></div><div className="hero-stats"><div><strong>{materials.length}</strong><span>材料总数</span></div><div><strong>{materials.filter((item) => item.sourceType === "private-local").length}</strong><span>本机私有</span></div><div><strong>{materials.filter((item) => item.sourceType === "local").length}</strong><span>临时导入</span></div></div></section>
      <nav className="tabs">{tabs.map((tab) => <button key={tab.id} className={activeTab === tab.id ? "active" : ""} onClick={() => { setActiveTab(tab.id); setStatusFilter("全部"); setOpenId(null); }}><span>{tab.label}</span><small>{tab.hint}</small><b>{materials.filter((item) => item.route === tab.id).length}</b></button>)}</nav>
      <section className="library"><div className="library-head"><div><p className="section-kicker">MATERIAL INDEX</p><h2>{currentTab.label}</h2><p>{currentTab.hint}，共 {materials.filter((item) => item.route === activeTab).length} 份。</p></div><div className="filter-stack"><label className="search"><span>⌕</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索管理人或策略" /></label><div className="month-filter"><label><span>年份</span><select value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)}><option value="">全部年份</option>{availableYears.map((year) => <option key={year} value={year}>{year}年</option>)}</select></label><label><span>月份</span><select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}><option value="">全部月份</option>{Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option key={month} value={month}>{month}月</option>)}</select></label></div></div></div>
        <div className="status-filters"><button className={statusFilter === "全部" ? "active" : ""} onClick={() => setStatusFilter("全部")}>全部 <span>{materials.filter((item) => item.route === activeTab).length}</span></button>{statusOptions.map((status) => <button key={status} className={statusFilter === status ? "active" : ""} onClick={() => setStatusFilter(status)}>{status} <span>{counts[status]}</span></button>)}</div>
        <div className="material-list">{!loaded ? <div className="empty-state"><p>正在读取浏览器材料库…</p></div> : filtered.length ? filtered.map((material) => <MaterialCard key={material.id} material={material} open={openId === material.id} onToggle={() => toggleMaterial(material)} onRename={() => renameMaterial(material)} onStatus={() => updateMaterial(material, { status: material.status === "已发布" ? "待复核" : "已发布" }).catch((error) => setNotice({ kind: "error", text: safeError(error, "状态更新失败") }))} onDelete={() => removeMaterial(material)} onAttach={() => chooseAttachment(material)} deleting={deletingId === material.id} />) : <div className="empty-state"><span>◎</span><h3>没有符合条件的材料</h3><p>当前搜索词、状态或月份下没有材料，请调整筛选条件。</p></div>}</div>
      </section><footer><span>{builtInMaterials.length}份网站内置材料 · 本地材料仅当前浏览器可见</span><span>无后端 · GitHub Pages · IndexedDB</span></footer>
    </div>
    <input ref={attachInputRef} hidden type="file" accept="application/pdf,.pdf" onChange={handleAttachment} />
    {uploadOpen && <div className="modal-backdrop" onMouseDown={() => !uploading && setUploadOpen(false)}><section className="upload-modal" role="dialog" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setUploadOpen(false)}>×</button><p className="section-kicker">BROWSER-ONLY INGEST</p><h2>本地导入一份PDF</h2><p className="modal-intro">PDF仅在当前浏览器处理，默认最大20MB，不会发送到GitHub或任何云端。</p><div className="type-choice">{tabs.map((tab) => <button key={tab.id} className={uploadForm.route === tab.id ? "active" : ""} onClick={() => setUploadForm((form) => ({ ...form, route: tab.id }))}>{tab.label}</button>)}</div><div className="upload-fields"><label>管理人<input value={uploadForm.manager} onChange={(event) => setUploadForm((form) => ({ ...form, manager: event.target.value }))} placeholder="请输入管理人" /></label><label>标题<input value={uploadForm.title} onChange={(event) => setUploadForm((form) => ({ ...form, title: event.target.value }))} placeholder="默认使用文件名" /></label><label>日期<input type="date" value={uploadForm.materialDate} onChange={(event) => setUploadForm((form) => ({ ...form, materialDate: event.target.value }))} /></label></div><button className={`dropzone ${selectedFile ? "has-file" : ""}`} onClick={() => fileInputRef.current?.click()}><span className="upload-symbol">{selectedFile ? "✓" : "↑"}</span><strong>{selectedFile?.name || "选择本地PDF"}</strong><small>{selectedFile ? `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB` : "仅支持.pdf，最大20MB"}</small></button><input ref={fileInputRef} hidden type="file" accept="application/pdf,.pdf" onChange={handleFile} /><label className="save-option"><input type="checkbox" checked={!uploadForm.savePdf} onChange={(event) => setUploadForm((form) => ({ ...form, savePdf: !event.target.checked }))} /> 仅保存正文、不保存PDF原件</label><button className="confirm-upload" disabled={!selectedFile || !uploadForm.manager.trim() || !uploadForm.title.trim() || uploading} onClick={importPdf}>{uploading ? "正在本地提取与保存…" : "开始本地导入"}</button></section></div>}
    {batchOpen && <div className="modal-backdrop" onMouseDown={() => !batchBusy && setBatchOpen(false)}><section className="upload-modal batch-modal" role="dialog" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setBatchOpen(false)}>×</button><p className="section-kicker">CRAWLER ARCHIVE INGEST</p><h2>批量导入已抓取材料</h2><p className="modal-intro">选择抓取元数据、目标PDF和分页正文JSON。仅导入“尽调报告”和“路演材料”，并优先用SHA-256或文件ID匹配现有卡片。</p><div className="batch-fields"><label>① 元数据JSON<input type="file" accept="application/json,.json" onChange={(event) => setBatchMetadata(event.target.files?.[0] ?? null)} /><span>{batchMetadata?.name || "未选择"}</span></label><label>② PDF原件（可多选）<input type="file" multiple accept="application/pdf,.pdf" onChange={(event) => setBatchPdfs(Array.from(event.target.files ?? []))} /><span>已选择 {batchPdfs.length} 份</span></label><label>③ 分页正文JSON（可多选）<input type="file" multiple accept="application/json,.json" onChange={(event) => setBatchPages(Array.from(event.target.files ?? []))} /><span>已选择 {batchPages.length} 份</span></label></div><div className="batch-note">非目标材料和待人工确认不会导入。PDF与正文仅保存在当前浏览器IndexedDB。</div><button className="confirm-upload" disabled={!batchMetadata || !batchPdfs.length || batchBusy} onClick={importCrawledBatch}>{batchBusy ? "正在核对、绑定并保存…" : "开始批量导入"}</button></section></div>}
    {aiSettingsOpen && <div className="modal-backdrop" onMouseDown={() => setAiSettingsOpen(false)}><section className="ai-settings-modal" role="dialog" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setAiSettingsOpen(false)}>×</button><p className="section-kicker">BROWSER MEMORY ONLY</p><h2>AI设置</h2><p className="modal-intro">API Key只保存在当前页面内存中，不写入Git、IndexedDB、日志或页面源码；刷新后需重新输入。浏览器将直接连接你配置的服务商。</p><div className="ai-form-grid"><label><span>API服务商</span><select value={aiForm.provider} onChange={(event) => setAiForm({ ...aiForm, provider: event.target.value })}><option value="openai-compatible">OpenAI兼容接口</option></select></label><label><span>API地址</span><input value={aiForm.baseUrl} onChange={(event) => setAiForm({ ...aiForm, baseUrl: event.target.value })} /></label><label><span>模型名称</span><input value={aiForm.model} onChange={(event) => setAiForm({ ...aiForm, model: event.target.value })} placeholder="例如 gpt-4.1-mini" /></label><label><span>API Key</span><input type="password" autoComplete="off" value={aiForm.apiKey} onChange={(event) => setAiForm({ ...aiForm, apiKey: event.target.value })} placeholder={aiConfigured ? "••••••••（当前会话已配置）" : "仅当前页面内存"} /></label></div>{aiFeedback && <div className={`ai-feedback ${aiFeedback.kind}`}>{aiFeedback.text}</div>}<div className="ai-settings-actions"><button className="secondary-action" disabled={aiBusy} onClick={testAi}>{aiBusy ? "测试中…" : "测试连接"}</button><button className="primary-action" onClick={saveAiSettings}>保存到当前会话</button></div></section></div>}
    {assistantOpen && <div className="assistant-backdrop" onMouseDown={() => setAssistantOpen(false)}><aside className="assistant-panel" onMouseDown={(event) => event.stopPropagation()}><div className="assistant-head"><div><p className="section-kicker">GROUNDED MATERIAL Q&A</p><h2>AI材料助手</h2></div><button onClick={() => setAssistantOpen(false)}>×</button></div><div className="scope-row"><label>问答范围</label><select value={chatScope} onChange={(event) => setChatScope(event.target.value as AiScope)}><option value="all">全部材料</option><option value="due-diligence">尽调报告</option><option value="manager-materials">路演材料</option><option value="current" disabled={!openId}>当前打开的单份材料</option></select></div><div className="sharing-warning">发送问题前请注意：检索到的相关材料片段会被发送至你配置的AI服务商。</div><div className="chat-thread">{chatMessages.length ? chatMessages.map((message) => <div className={`chat-message ${message.role}`} key={message.id}><span>{message.role === "assistant" ? "AI" : "你"}</span><div><p>{message.content}</p>{message.citations && <div className="citation-list">{message.citations.map((citation, index) => <button key={`${citation.materialId}-${index}`} onClick={() => openCitation(citation)}><b>依据 {index + 1} · {citation.title}</b><span>{citation.manager} · {citation.paragraphLabel}</span><small>{citation.excerpt}</small></button>)}</div>}</div></div>) : <div className="chat-empty"><span>✦</span><strong>从材料中寻找答案</strong><p>每次回答都会附带可打开的材料依据。</p></div>}{chatBusy && <div className="chat-loading">正在基于相关材料生成回答…</div>}</div><div className="chat-composer"><textarea value={chatQuestion} onChange={(event) => setChatQuestion(event.target.value)} placeholder="向材料库提问…" /><div><button className="clear-chat" onClick={() => setChatMessages([])}>清空对话</button><button className="send-chat" disabled={!chatQuestion.trim() || chatBusy} onClick={sendQuestion}>发送问题</button></div></div></aside></div>}
  </main>;
}
