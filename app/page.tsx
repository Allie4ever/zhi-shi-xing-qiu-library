"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import curatedData from "../data/materials-curated.json";

type Route = "due-diligence" | "manager-materials";
type Status = "待解析" | "待复核" | "已发布" | "解析失败";
type AiScope = "all" | "due-diligence" | "manager-materials" | "current";

type Citation = {
  id: number;
  materialId: string;
  title: string;
  manager: string;
  pageNumber: number | null;
  paragraphLabel: string | null;
  excerpt: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
};

type AiPublicSettings = {
  configured: boolean;
  provider: string;
  baseUrl: string;
  model: string;
  keyMask: string;
};

type Material = {
  id: string;
  route: Route;
  manager: string;
  title: string;
  materialDate: string;
  materialType: string;
  strategy: string;
  summary: string;
  highlights: string[];
  risks: string[];
  tags: string[];
  sourceProvider?: string;
  sourcePath?: string;
  reviewStatus?: string;
  status: Status;
  pdfUrl?: string;
  fileName?: string;
  fileHash?: string;
  needsOcr?: boolean;
  summaryKind?: "none" | "test-rule";
  pages?: { pageNumber: number; text: string; charCount: number }[];
  totalPages?: number;
  totalChars?: number;
  parseError?: string | null;
  statusHistory?: { status: Status; at: string }[];
  isLocal?: boolean;
};

const initialMaterials: Material[] = curatedData.materials.map((item) => ({
  ...item,
  route: item.route as Route,
  status: "已发布" as Status,
}));

const tabs: { id: Route; label: string; hint: string }[] = [
  { id: "due-diligence", label: "尽调报告", hint: "访谈、现场与完整尽调" },
  { id: "manager-materials", label: "路演材料", hint: "管理人介绍、策略与产品材料" },
];

const statusOptions: Status[] = ["待解析", "待复核", "已发布", "解析失败"];
const LOCAL_API = "http://localhost:3001";

function displayDate(value: string) {
  const parts = value.split("-");
  if (parts.length === 2) return `${parts[0]}年${Number(parts[1])}月`;
  if (parts.length === 3)
    return `${parts[0]}年${Number(parts[1])}月${Number(parts[2])}日`;
  return value;
}

function MaterialCard({
  material,
  open,
  onToggle,
  onRename,
  onPublish,
  publishing,
}: {
  material: Material;
  open: boolean;
  onToggle: () => void;
  onRename: (material: Material) => void;
  onPublish: (material: Material) => void;
  publishing: boolean;
}) {
  const hasOriginalPdf = Boolean(material.pdfUrl || material.sourcePath);

  return (
    <article id={`material-${material.id}`} className={`material-card ${open ? "is-open" : ""}`}>
      <div
        className="card-summary"
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggle();
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-controls={`detail-${material.id}`}
      >
        <div className="card-date">
          <span>{material.materialDate.slice(0, 4)}</span>
          <strong>{material.materialDate.slice(5).replace("-", ".") || "—"}</strong>
        </div>
        <div className="card-main">
          <div className="eyebrow-row">
            <span className="manager">{material.manager}</span>
            <span className={`status status-${material.status}`}>{material.status}</span>
          </div>
          <div className="title-row">
            <h2>{material.title}</h2>
            {material.isLocal && (
              <button
                className="rename-button"
                type="button"
                aria-label={`重命名《${material.title}》`}
                title="重命名标题"
                onKeyDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onRename(material);
                }}
              >
                ✎
              </button>
            )}
          </div>
          <div className="meta-row">
            <span>{material.strategy}</span>
            <span>{displayDate(material.materialDate)}</span>
            {hasOriginalPdf && <span className="pdf-mark">PDF</span>}
          </div>
          <p className="summary">{material.summary}</p>
          <div className="tag-row">
            {material.tags.map((tag) => (
              <span className="tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </div>
        <span className="expand-control" aria-hidden="true">
          <span>{open ? "收起" : "查看详情"}</span>
          <i>{open ? "−" : "+"}</i>
        </span>
      </div>

      {open && (
        <div className="card-detail" id={`detail-${material.id}`}>
          {material.isLocal && (
            <section className="record-audit">
              <div>
                <strong>文件 SHA-256</strong>
                <code>{material.fileHash}</code>
              </div>
              <div>
                <strong>处理轨迹</strong>
                <p>{material.statusHistory?.map((item) => item.status).join(" → ")}</p>
              </div>
              {material.status === "待复核" && (
                <button onClick={() => onPublish(material)} disabled={publishing}>
                  {publishing ? "发布中…" : "复核完成，标记已发布"}
                </button>
              )}
            </section>
          )}

          <section className="pdf-panel">
            <div className="pdf-toolbar">
              <div>
                <span className="pdf-badge">PDF</span>
                <div>
                  <h3>原始材料</h3>
                  <p>{material.fileName || material.sourcePath || "当前记录暂无原始 PDF"}</p>
                </div>
              </div>
              {material.pdfUrl && (
                <a href={material.pdfUrl} target="_blank" rel="noreferrer">
                  在新窗口打开
                </a>
              )}
            </div>
            {material.pdfUrl ? (
              <iframe title={`${material.title} PDF 预览`} src={material.pdfUrl} />
            ) : (
              <div className="pdf-placeholder">
                <div className="pdf-sheet">PDF</div>
                <div>
                  <strong>{hasOriginalPdf ? "原始 PDF 路径已记录" : "暂无 PDF 原件"}</strong>
                  <p>
                    {hasOriginalPdf
                      ? "第一阶段不复制带教原件；接入本地文件或 R2 后可在此在线预览。"
                      : "上传 PDF 后，这里会显示浏览器内置预览。"}
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </article>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<Route>("due-diligence");
  const [materials, setMaterials] = useState(initialMaterials);
  const [openId, setOpenId] = useState<string | null>(initialMaterials[0]?.id ?? null);
  const [statusFilter, setStatusFilter] = useState<Status | "全部">("全部");
  const [query, setQuery] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadType, setUploadType] = useState<Route>("due-diligence");
  const [uploading, setUploading] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [apiReady, setApiReady] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [aiSettings, setAiSettings] = useState<AiPublicSettings>({
    configured: false,
    provider: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    model: "",
    keyMask: "",
  });
  const [aiForm, setAiForm] = useState({
    provider: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    model: "",
    apiKey: "",
  });
  const [aiBusy, setAiBusy] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [chatScope, setChatScope] = useState<AiScope>("all");
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`${LOCAL_API}/api/materials`)
      .then(async (response) => {
        if (!response.ok) throw new Error("无法读取本地材料记录");
        return response.json();
      })
      .then(({ materials: localMaterials }) => {
        const persisted = (localMaterials as Material[]).map((item) => ({ ...item, isLocal: true }));
        setMaterials([...persisted, ...initialMaterials]);
        setApiReady(true);
      })
      .catch((error) => {
        setNotice({ kind: "error", text: `${error.message}。请确认已通过 npm run dev 启动本地服务。` });
      });
  }, []);

  useEffect(() => {
    fetch(`${LOCAL_API}/api/ai/settings`)
      .then((response) => response.json())
      .then((settings: AiPublicSettings) => {
        setAiSettings(settings);
        setAiForm((current) => ({
          ...current,
          provider: settings.provider || "openai-compatible",
          baseUrl: settings.baseUrl || current.baseUrl,
          model: settings.model || "",
          apiKey: "",
        }));
      })
      .catch(() => {});
  }, []);

  const filtered = useMemo(
    () =>
      materials.filter((material) => {
        const matchesTab = material.route === activeTab;
        const matchesStatus = statusFilter === "全部" || material.status === statusFilter;
        const haystack = [
          material.manager,
          material.title,
          material.strategy,
          ...material.tags,
        ]
          .join(" ")
          .toLowerCase();
        return matchesTab && matchesStatus && haystack.includes(query.trim().toLowerCase());
      }),
    [activeTab, materials, query, statusFilter],
  );

  const counts = useMemo(
    () =>
      statusOptions.reduce(
        (acc, status) => {
          acc[status] = materials.filter(
            (item) => item.route === activeTab && item.status === status,
          ).length;
          return acc;
        },
        {} as Record<Status, number>,
      ),
    [activeTab, materials],
  );

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file?.type === "application/pdf" || file?.name.toLowerCase().endsWith(".pdf")) {
      setSelectedFile(file);
      setNotice(null);
    } else if (file) {
      setSelectedFile(null);
      setNotice({ kind: "error", text: "只能上传扩展名为 .pdf 的文件。" });
    }
  }

  async function addUploadedMaterial() {
    if (!selectedFile) return;
    setUploading(true);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      const uploadResponse = await fetch(
        `${LOCAL_API}/api/materials/upload?route=${encodeURIComponent(uploadType)}`,
        { method: "POST", body: form },
      );
      const uploadResult = await uploadResponse.json();
      if (uploadResponse.status === 409) {
        throw new Error(`检测到重复文件，已有记录：${uploadResult.record.title}`);
      }
      if (!uploadResponse.ok) throw new Error(uploadResult.error || "上传保存失败");
      const pending = { ...uploadResult.record, isLocal: true } as Material;
      setMaterials((current) => [pending, ...current.filter((item) => item.id !== pending.id)]);
      setActiveTab(uploadType);
      setStatusFilter("全部");
      setOpenId(pending.id);
      setUploadOpen(false);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setNotice({ kind: "success", text: "PDF 已保存到私有本地目录，正在逐页解析…" });

      const parseResponse = await fetch(`${LOCAL_API}/api/materials/${pending.id}/parse`, {
        method: "POST",
      });
      const parseResult = await parseResponse.json();
      if (!parseResponse.ok) throw new Error(parseResult.error || "PDF解析失败");
      const parsed = { ...parseResult.record, isLocal: true } as Material;
      setMaterials((current) => current.map((item) => (item.id === parsed.id ? parsed : item)));
      setNotice({
        kind: parsed.needsOcr ? "error" : "success",
        text: parsed.needsOcr
          ? "文件已保存，但没有提取到足够文字，已标记为需要OCR。"
          : `解析完成：共 ${parsed.totalPages} 页、${parsed.totalChars?.toLocaleString()} 个可提取字符，等待人工复核。`,
      });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "上传或解析失败" });
    } finally {
      setUploading(false);
    }
  }

  async function publishMaterial(material: Material) {
    setPublishingId(material.id);
    setNotice(null);
    try {
      const response = await fetch(`${LOCAL_API}/api/materials/${material.id}/publish`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "发布状态更新失败");
      const published = { ...result.record, isLocal: true } as Material;
      setMaterials((current) => current.map((item) => (item.id === published.id ? published : item)));
      setNotice({ kind: "success", text: "材料已标记为已发布，本地记录已持久化。" });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "状态更新失败" });
    } finally {
      setPublishingId(null);
    }
  }

  async function renameMaterial(material: Material) {
    const nextTitle = window.prompt("请输入新的材料标题", material.title)?.trim();
    if (!nextTitle || nextTitle === material.title) return;
    setRenamingId(material.id);
    setNotice(null);
    try {
      const response = await fetch(`${LOCAL_API}/api/materials/${material.id}/rename`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: nextTitle }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "重命名失败");
      const renamed = { ...result.record, isLocal: true } as Material;
      setMaterials((current) => current.map((item) => (item.id === renamed.id ? renamed : item)));
      setNotice({ kind: "success", text: "材料标题已更新，刷新页面后仍会保留。" });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "重命名失败" });
    } finally {
      setRenamingId(null);
    }
  }

  async function saveAiSettings() {
    if (!aiForm.apiKey.trim()) {
      setAiFeedback({ kind: "error", text: aiSettings.configured ? "如需更新设置，请重新输入API Key。" : "请输入API Key。" });
      return false;
    }
    setAiBusy(true);
    setAiFeedback(null);
    try {
      const response = await fetch(`${LOCAL_API}/api/ai/settings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(aiForm),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "AI设置保存失败");
      setAiSettings(result);
      setAiForm((current) => ({ ...current, apiKey: "" }));
      setAiFeedback({ kind: "success", text: "设置已保存在当前本地后端会话中。" });
      return true;
    } catch (error) {
      setAiFeedback({ kind: "error", text: error instanceof Error ? error.message : "AI设置保存失败" });
      return false;
    } finally {
      setAiBusy(false);
    }
  }

  async function testAiConnection() {
    let ready = aiSettings.configured;
    if (aiForm.apiKey.trim()) ready = await saveAiSettings();
    if (!ready) {
      setAiFeedback({ kind: "error", text: "请先完整配置AI API。" });
      return;
    }
    setAiBusy(true);
    setAiFeedback(null);
    try {
      const response = await fetch(`${LOCAL_API}/api/ai/test`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "连接测试失败");
      setAiFeedback({ kind: "success", text: "连接成功，可以开始向材料库提问。" });
    } catch (error) {
      setAiFeedback({ kind: "error", text: error instanceof Error ? error.message : "连接测试失败" });
    } finally {
      setAiBusy(false);
    }
  }

  async function sendChatQuestion() {
    const question = chatQuestion.trim();
    if (!question || chatBusy) return;
    if (!aiSettings.configured) {
      setAiSettingsOpen(true);
      setAiFeedback({ kind: "error", text: "请先配置AI API。" });
      return;
    }
    const userMessage: ChatMessage = { id: `user-${Date.now()}`, role: "user", content: question };
    const history = chatMessages.map(({ role, content }) => ({ role, content })).slice(-6);
    setChatMessages((current) => [...current, userMessage]);
    setChatQuestion("");
    setChatBusy(true);
    try {
      const response = await fetch(`${LOCAL_API}/api/ai/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question,
          scope: chatScope,
          currentMaterialId: openId,
          history,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "AI问答失败");
      setChatMessages((current) => [...current, {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: result.answer,
        citations: result.citations,
      }]);
    } catch (error) {
      setChatMessages((current) => [...current, {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: error instanceof Error ? error.message : "AI问答失败",
      }]);
    } finally {
      setChatBusy(false);
    }
  }

  function openCitation(citation: Citation) {
    const material = materials.find((item) => item.id === citation.materialId);
    if (!material) return;
    setActiveTab(material.route);
    setStatusFilter("全部");
    setQuery("");
    setOpenId(material.id);
    window.setTimeout(() => {
      document.getElementById(`material-${material.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  }

  const currentTab = tabs.find((tab) => tab.id === activeTab)!;
  const openMaterial = materials.find((material) => material.id === openId) || null;

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#" aria-label="知识星球材料库首页">
          <span className="brand-mark">知</span>
          <span>
            <strong>知识星球材料库</strong>
            <small>PRIVATE FUND RESEARCH LIBRARY</small>
          </span>
        </a>
        <div className="header-actions">
          <span className="local-pill"><i /> 本地模式</span>
          <button className="ai-entry" onClick={() => setAiSettingsOpen(true)}>
            <span className={aiSettings.configured ? "is-ready" : ""} /> AI设置
          </button>
          <button className="assistant-entry" onClick={() => setAssistantOpen(true)}>
            ✦ AI材料助手
          </button>
          <button className="upload-button" onClick={() => setUploadOpen(true)}>
            <span>＋</span> 上传材料
          </button>
        </div>
      </header>

      <div className="workspace">
        {notice && <div className={`notice notice-${notice.kind}`} role="status">{notice.text}</div>}
        <section className="hero">
          <div>
            <p className="kicker">RESEARCH ARCHIVE / 研究档案</p>
            <h1>把每一份材料，<em>变成可验证的判断。</em></h1>
            <p className="hero-copy">
              聚合尽调报告与路演材料，沉淀结构化重点、风险提示和原始依据。
            </p>
          </div>
          <div className="hero-stats">
            <div><strong>{materials.length}</strong><span>材料总数</span></div>
            <div><strong>{new Set(materials.map((m) => m.manager)).size}</strong><span>覆盖管理人</span></div>
            <div><strong>{counts["待解析"] + counts["待复核"]}</strong><span>当前待处理</span></div>
          </div>
        </section>

        <nav className="tabs" aria-label="材料分类">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={activeTab === tab.id ? "active" : ""}
              onClick={() => {
                setActiveTab(tab.id);
                setStatusFilter("全部");
                setOpenId(null);
              }}
            >
              <span>{tab.label}</span>
              <small>{tab.hint}</small>
              <b>{materials.filter((m) => m.route === tab.id).length}</b>
            </button>
          ))}
        </nav>

        <section className="library">
          <div className="library-head">
            <div>
              <p className="section-kicker">MATERIAL INDEX</p>
              <h2>{currentTab.label}</h2>
              <p>{currentTab.hint}，共 {materials.filter((m) => m.route === activeTab).length} 份。</p>
            </div>
            <label className="search">
              <span>⌕</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索管理人、策略或标签"
                aria-label="搜索材料"
              />
            </label>
          </div>

          <div className="status-filters" aria-label="处理状态筛选">
            <button
              className={statusFilter === "全部" ? "active" : ""}
              onClick={() => setStatusFilter("全部")}
            >
              全部 <span>{materials.filter((m) => m.route === activeTab).length}</span>
            </button>
            {statusOptions.map((status) => (
              <button
                key={status}
                className={statusFilter === status ? "active" : ""}
                onClick={() => setStatusFilter(status)}
              >
                {status} <span>{counts[status]}</span>
              </button>
            ))}
          </div>

          <div className="material-list">
            {filtered.length ? (
              filtered.map((material) => (
                <MaterialCard
                  key={material.id}
                  material={material}
                  open={openId === material.id}
                  onToggle={() => setOpenId(openId === material.id ? null : material.id)}
                  onRename={renameMaterial}
                  onPublish={publishMaterial}
                  publishing={publishingId === material.id || renamingId === material.id}
                />
              ))
            ) : (
              <div className="empty-state">
                <span>◎</span>
                <h3>没有符合条件的材料</h3>
                <p>调整状态或搜索词后再试。</p>
              </div>
            )}
          </div>
        </section>

        <footer>
          <span>数据更新于 {curatedData.reviewedAt}</span>
          <span>第一阶段 · 本地 MVP · 原始文件只读</span>
        </footer>
      </div>

      {uploadOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setUploadOpen(false)}>
          <section
            className="upload-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="modal-close" onClick={() => setUploadOpen(false)} aria-label="关闭">
              ×
            </button>
            <p className="section-kicker">LOCAL INGEST</p>
            <h2 id="upload-title">上传一份 PDF 材料</h2>
            <p className="modal-intro">
              文件将保存到项目的私有本地目录，并计算 SHA-256 去重。不会上传到任何外部服务。
            </p>
            <div className="type-choice">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  className={uploadType === tab.id ? "active" : ""}
                  onClick={() => setUploadType(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button className={`dropzone ${selectedFile ? "has-file" : ""}`} onClick={() => fileInputRef.current?.click()}>
              <span className="upload-symbol">{selectedFile ? "✓" : "↑"}</span>
              <strong>{selectedFile ? selectedFile.name : "选择本地 PDF"}</strong>
              <small>{selectedFile ? `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB` : "仅支持 .pdf 文件"}</small>
            </button>
            <input ref={fileInputRef} hidden type="file" accept="application/pdf,.pdf" onChange={handleFile} />
            <div className="pipeline">
              <span className="active">待解析</span><i />
              <span>待复核</span><i />
              <span>已发布</span>
            </div>
            <button className="confirm-upload" disabled={!selectedFile || uploading || !apiReady} onClick={addUploadedMaterial}>
              {uploading ? "正在保存与解析…" : apiReady ? "保存并开始解析" : "本地服务未就绪"}
            </button>
          </section>
        </div>
      )}

      {aiSettingsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setAiSettingsOpen(false)}>
          <section
            className="ai-settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-settings-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="modal-close" onClick={() => setAiSettingsOpen(false)} aria-label="关闭AI设置">×</button>
            <p className="section-kicker">LOCAL AI SESSION</p>
            <h2 id="ai-settings-title">AI设置</h2>
            <p className="modal-intro">
              API Key仅保存在当前本地后端内存中，不写入项目、日志或云端；重启服务后需重新输入。
            </p>
            <div className="ai-form-grid">
              <label>
                <span>API服务商</span>
                <select
                  value={aiForm.provider}
                  onChange={(event) => setAiForm({ ...aiForm, provider: event.target.value })}
                >
                  <option value="openai-compatible">OpenAI兼容接口</option>
                </select>
              </label>
              <label>
                <span>API地址</span>
                <input
                  type="url"
                  value={aiForm.baseUrl}
                  onChange={(event) => setAiForm({ ...aiForm, baseUrl: event.target.value })}
                  placeholder="https://api.example.com/v1"
                />
              </label>
              <label>
                <span>模型名称</span>
                <input
                  value={aiForm.model}
                  onChange={(event) => setAiForm({ ...aiForm, model: event.target.value })}
                  placeholder="输入服务商提供的模型名称"
                />
              </label>
              <label>
                <span>API Key</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={aiForm.apiKey}
                  onChange={(event) => setAiForm({ ...aiForm, apiKey: event.target.value })}
                  placeholder={aiSettings.keyMask || "仅在当前本地会话中使用"}
                />
                {aiSettings.configured && <small>当前Key：{aiSettings.keyMask}</small>}
              </label>
            </div>
            {aiFeedback && <div className={`ai-feedback ${aiFeedback.kind}`}>{aiFeedback.text}</div>}
            <div className="ai-settings-actions">
              <button className="secondary-action" onClick={testAiConnection} disabled={aiBusy}>
                {aiBusy ? "正在连接…" : "测试连接"}
              </button>
              <button className="primary-action" onClick={saveAiSettings} disabled={aiBusy}>
                保存到当前会话
              </button>
            </div>
          </section>
        </div>
      )}

      {assistantOpen && (
        <div className="assistant-backdrop" role="presentation" onMouseDown={() => setAssistantOpen(false)}>
          <aside
            className="assistant-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="assistant-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="assistant-head">
              <div>
                <p className="section-kicker">GROUNDED MATERIAL Q&A</p>
                <h2 id="assistant-title">AI材料助手</h2>
              </div>
              <button onClick={() => setAssistantOpen(false)} aria-label="关闭AI材料助手">×</button>
            </header>
            <div className="scope-row">
              <label htmlFor="chat-scope">问答范围</label>
              <select id="chat-scope" value={chatScope} onChange={(event) => setChatScope(event.target.value as AiScope)}>
                <option value="all">全部材料</option>
                <option value="due-diligence">尽调报告</option>
                <option value="manager-materials">路演材料</option>
                <option value="current" disabled={!openMaterial}>
                  {openMaterial ? `当前材料：${openMaterial.title}` : "当前打开的单份材料"}
                </option>
              </select>
            </div>
            <div className="sharing-warning">
              发送问题后，本地检索命中的相关材料片段会发送至你配置的AI服务商。不会发送整个材料库。
            </div>
            <div className="chat-thread" aria-live="polite">
              {chatMessages.length === 0 ? (
                <div className="chat-empty">
                  <span>✦</span>
                  <strong>从材料中寻找可核验的答案</strong>
                  <p>回答将附上材料、管理人与PDF页码或正文段落。</p>
                </div>
              ) : chatMessages.map((message) => (
                <article className={`chat-message ${message.role}`} key={message.id}>
                  <span>{message.role === "user" ? "你" : "AI"}</span>
                  <div>
                    <p>{message.content}</p>
                    {message.citations && message.citations.length > 0 && (
                      <div className="citation-list">
                        {message.citations.map((citation) => (
                          <button key={`${message.id}-${citation.id}`} onClick={() => openCitation(citation)}>
                            <b>[资料{citation.id}] {citation.title}</b>
                            <span>{citation.manager} · {citation.pageNumber ? `PDF第${citation.pageNumber}页` : citation.paragraphLabel}</span>
                            <small>{citation.excerpt}</small>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              ))}
              {chatBusy && <div className="chat-loading">正在检索材料并生成带引用的回答…</div>}
            </div>
            <div className="chat-composer">
              <textarea
                value={chatQuestion}
                onChange={(event) => setChatQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendChatQuestion();
                  }
                }}
                placeholder="输入关于材料的问题…"
                maxLength={1000}
              />
              <div>
                <button className="clear-chat" onClick={() => setChatMessages([])} disabled={!chatMessages.length}>清空对话</button>
                <button className="send-chat" onClick={sendChatQuestion} disabled={!chatQuestion.trim() || chatBusy}>
                  {chatBusy ? "回答中…" : "发送"}
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
