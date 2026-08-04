# 知识星球材料库

无需登录的私募研究材料库。公开页面部署在 GitHub Pages；localhost 开发服务器会通过
只读接口自动索引 `private/PDF资料`，用户无需逐份上传已抓取材料。

## 本地运行

```bash
npm install
npm run dev
```

开发地址通常为 `http://localhost:3000/`。

启动后，本机模式自动读取：

- `private/PDF资料/尽调报告/`（存在时）
- `private/PDF资料/路演材料/`
- `private/PDF资料/元数据/`
- `private/PDF资料/分页正文/`

本地接口包括 `GET /api/local-materials`、单份元数据、PDF和分页正文；PDF支持Range读取。
接口只在开发服务器启用，不能写入原始文件，也不能读取配置目录之外的路径。

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
