"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import curatedData from "../data/materials-curated.json";

type Route = "due-diligence" | "manager-materials";
type Status = "待解析" | "待复核" | "已发布" | "解析失败";

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
}: {
  material: Material;
  open: boolean;
  onToggle: () => void;
}) {
  const hasOriginalPdf = Boolean(material.pdfUrl || material.sourcePath);

  return (
    <article className={`material-card ${open ? "is-open" : ""}`}>
      <button
        className="card-summary"
        onClick={onToggle}
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
          <h2>{material.title}</h2>
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
      </button>

      {open && (
        <div className="card-detail" id={`detail-${material.id}`}>
          <div className="detail-grid">
            <section className="detail-section highlights">
              <div className="section-title">
                <span className="section-icon">✦</span>
                <h3>核心重点</h3>
              </div>
              <ol>
                {material.highlights.map((highlight) => (
                  <li key={highlight}>{highlight}</li>
                ))}
              </ol>
            </section>
            <section className="detail-section risks">
              <div className="section-title">
                <span className="section-icon">!</span>
                <h3>风险与待核验</h3>
              </div>
              <ol>
                {material.risks.map((risk) => (
                  <li key={risk}>{risk}</li>
                ))}
              </ol>
            </section>
          </div>

          <section className="full-text">
            <div className="section-title">
              <span className="section-icon">¶</span>
              <h3>完整正文</h3>
              <span className="source-note">
                MVP 测试正文 · 来自结构化材料
              </span>
            </div>
            <p>
              本材料围绕<strong>{material.manager}</strong>的
              {material.strategy}展开。{material.summary}
            </p>
            <p>
              从现有材料看，值得进一步关注的方面包括：
              {material.highlights.join("；")}。
            </p>
            <p>
              投资判断仍需结合原始材料与后续核验。当前重点风险包括：
              {material.risks.join("；")}。
            </p>
          </section>

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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    }
  }

  function addUploadedMaterial() {
    if (!selectedFile) return;
    const pdfUrl = URL.createObjectURL(selectedFile);
    const created: Material = {
      id: `local-${Date.now()}`,
      route: uploadType,
      manager: "待识别管理人",
      title: selectedFile.name.replace(/\.pdf$/i, ""),
      materialDate: new Date().toISOString().slice(0, 10),
      materialType: uploadType === "due-diligence" ? "管理人尽调报告" : "管理人推介材料",
      strategy: "待识别策略",
      summary: "文件已进入本地处理队列，等待 PDF 文字提取、OCR 与 AI 概要生成。",
      highlights: ["材料上传成功，尚未提取正文与关键信息。"],
      risks: ["解析完成前请勿用于投资判断。"],
      tags: ["本地上传", "待解析"],
      status: "待解析",
      pdfUrl,
      fileName: selectedFile.name,
    };
    setMaterials((current) => [created, ...current]);
    setActiveTab(uploadType);
    setStatusFilter("全部");
    setOpenId(created.id);
    setSelectedFile(null);
    setUploadOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const currentTab = tabs.find((tab) => tab.id === activeTab)!;

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
          <button className="upload-button" onClick={() => setUploadOpen(true)}>
            <span>＋</span> 上传材料
          </button>
        </div>
      </header>

      <div className="workspace">
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
            <p className="modal-intro">文件仅在当前浏览器会话中预览，不会改动原始参考文件。</p>
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
            <button className="confirm-upload" disabled={!selectedFile} onClick={addUploadedMaterial}>
              加入处理队列
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
