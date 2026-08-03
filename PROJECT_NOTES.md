# 知识星球材料库 · 第一阶段

这是一个独立本地 MVP，不与任何既有站点或仓库关联。

## 当前范围

- `data/materials-curated.json` 是从上级目录只读复制的测试数据快照。
- 上传 PDF 会复制到忽略版本控制的 `private/uploads/`，记录和逐页正文写入
  `private/data/materials.json`。
- 文件按 SHA-256 去重；重复文件不会再次保存。
- `pdfplumber` 按页提取文字并保留页码。提取字符不足时标记“需要OCR”，不生成正文。
- 摘要暂由本地规则生成，所有结果均带“测试摘要/测试提取/测试提示”标记。
- 逐页提取正文仅作为本地解析依据保存，不在页面详情中展示；用户直接预览原始 PDF。
- 带教提供的原始 Markdown、JSON 和 PDF 不会被本项目修改。
- 暂不访问知识星球，不调用 OCR 或任何云存储，也不会在用户提问前自动调用 AI。
- 知识星球采集和下载已暂停。AI 功能仅在用户于本地页面配置服务商后运行，
  Key 只存于后端进程内存，不写入文件。

## 预留接口

`lib/integrations/contracts.ts` 保留后续能力边界，但当前运行配置明确关闭 D1/R2。

## 本地运行

```bash
npm install
npm run dev
```

默认访问 `http://localhost:3000/`。

## 命令行解析单份 PDF

```bash
npm run parse:pdf -- --file "/绝对路径/材料.pdf" --route due-diligence
```

路演材料使用：

```bash
npm run parse:pdf -- --file "/绝对路径/材料.pdf" --route manager-materials
```
