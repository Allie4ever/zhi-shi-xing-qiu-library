const state = { materials: [], activeRoute: "due-diligence", status: "全部", query: "", openId: null };
const routeInfo = {
  "due-diligence": ["尽调报告", "访谈、现场与完整尽调"],
  "manager-materials": ["路演材料", "管理人介绍、策略与产品材料"],
};
const statuses = ["待解析", "待复核", "已发布", "解析失败"];

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function listItems(items, emptyText) {
  return items?.length ? `<ol>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>` : `<p class="pending">${emptyText}</p>`;
}

function filteredMaterials() {
  const query = state.query.toLowerCase();
  return state.materials.filter((material) => {
    if (material.route !== state.activeRoute) return false;
    if (state.status !== "全部" && material.status !== state.status) return false;
    return [material.manager, material.title, material.strategy, ...(material.tags || [])].join(" ").toLowerCase().includes(query);
  });
}

function renderFilters() {
  const routeMaterials = state.materials.filter((item) => item.route === state.activeRoute);
  document.querySelector("#status-filters").innerHTML = ["全部", ...statuses].map((status) => {
    const count = status === "全部" ? routeMaterials.length : routeMaterials.filter((item) => item.status === status).length;
    return `<button class="${state.status === status ? "active" : ""}" data-status="${status}">${status} <span>${count}</span></button>`;
  }).join("");
  document.querySelectorAll("[data-status]").forEach((button) => button.addEventListener("click", () => { state.status = button.dataset.status; render(); }));
}

function renderMaterials() {
  const materials = filteredMaterials();
  const container = document.querySelector("#material-list");
  if (!materials.length) {
    container.innerHTML = `<div class="empty"><strong>没有符合条件的材料</strong><p>调整状态或搜索词后再试。</p></div>`;
    return;
  }
  container.innerHTML = materials.map((material) => {
    const open = state.openId === material.id;
    const summary = material.summary || "待人工整理";
    return `<article class="card ${open ? "open" : ""}">
      <button class="card-summary" data-id="${escapeHtml(material.id)}" aria-expanded="${open}">
        <div class="date"><span>${escapeHtml(material.materialDate?.slice(0, 4) || "—")}</span><strong>${escapeHtml(material.materialDate?.slice(5).replace("-", ".") || "—")}</strong></div>
        <div class="main"><div class="eyebrow"><span>${escapeHtml(material.manager)}</span><i>${escapeHtml(material.status)}</i></div><h3>${escapeHtml(material.title)}</h3><div class="meta">${escapeHtml(material.strategy)} · ${escapeHtml(material.materialDate || "日期待整理")}</div><p>${escapeHtml(summary)}</p><div class="tags">${(material.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div></div>
        <span class="expand">${open ? "收起 −" : "查看详情 ＋"}</span>
      </button>
      ${open ? `<div class="detail">
        <section><h4>人工概要</h4><p>${escapeHtml(summary)}</p></section>
        <div class="detail-grid"><section><h4>核心重点</h4>${listItems(material.highlights, "待人工整理")}</section><section class="risks"><h4>风险与待核验</h4>${listItems(material.risks, "待人工整理")}</section></div>
        <section class="pdf"><div><b>PDF</b><span><strong>原始材料</strong><small>公开版不包含付费原件或本地PDF</small></span></div><p>请在项目本地版中查看已授权的原始文件与页码正文。</p></section>
      </div>` : ""}
    </article>`;
  }).join("");
  document.querySelectorAll(".card-summary").forEach((button) => button.addEventListener("click", () => { state.openId = state.openId === button.dataset.id ? null : button.dataset.id; renderMaterials(); }));
}

function render() {
  document.querySelectorAll("[data-route]").forEach((button) => { button.classList.toggle("active", button.dataset.route === state.activeRoute); button.querySelector("b").textContent = state.materials.filter((item) => item.route === button.dataset.route).length; });
  document.querySelector("#section-title").textContent = routeInfo[state.activeRoute][0];
  document.querySelector("#section-copy").textContent = `${routeInfo[state.activeRoute][1]}，共 ${state.materials.filter((item) => item.route === state.activeRoute).length} 份。`;
  renderFilters(); renderMaterials();
}

fetch("./materials.json").then((response) => response.json()).then((payload) => {
  state.materials = payload.materials;
  document.querySelector("#material-count").textContent = state.materials.length;
  document.querySelector("#manager-count").textContent = new Set(state.materials.map((item) => item.manager)).size;
  document.querySelector("#reviewed-at").textContent = `数据更新于 ${payload.reviewedAt || "—"}`;
  render();
});
document.querySelectorAll("[data-route]").forEach((button) => button.addEventListener("click", () => { state.activeRoute = button.dataset.route; state.status = "全部"; state.openId = null; render(); }));
document.querySelector("#search").addEventListener("input", (event) => { state.query = event.target.value.trim(); renderMaterials(); });
