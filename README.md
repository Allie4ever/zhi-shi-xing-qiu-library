# 知识星球材料库

无需登录、无需后端的静态私募研究材料库。公开页面部署在 GitHub Pages；用户导入的
PDF、分页正文和元数据只保存在当前浏览器的 IndexedDB 中，不会上传到 GitHub 或云端。

## 本地运行

```bash
npm install
npm run dev
```

开发地址通常为 `http://localhost:3000/`。

## 生产构建

```bash
npm run build
npm start
```

`npm run build` 与 GitHub Pages 工作流使用相同的 Vite 配置和同一个 React 页面组件，
产物输出到被 Git 忽略的 `pages-dist/`。

## 浏览器本地处理

- PDF.js 逐页提取确定性文字并保留页码；无有效文字时标记“需要OCR”。
- SHA-256 防止重复导入，默认限制单个 PDF 最大 20MB。
- IndexedDB 保存本地材料，可选择只保存正文而不保存 PDF 原件。
- 支持导出备份、导入恢复、删除单份材料和二次确认清空。
- API Key 仅在 AI 设置的当前页面内存中保存，刷新页面后清除。

仓库不包含本地导入的 PDF、提取正文、浏览器数据或 API Key，`private/` 始终被 Git 忽略。

## 测试

```bash
npm test
npm run lint
```
