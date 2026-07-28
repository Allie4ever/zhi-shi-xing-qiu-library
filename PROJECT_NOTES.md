# 知识星球材料库 · 第一阶段

这是一个独立本地 MVP，不与任何既有站点或仓库关联。

## 当前范围

- `data/materials-curated.json` 是从上级目录只读复制的测试数据快照。
- 本地上传仅在当前浏览器会话中保留，并生成 PDF 临时预览地址。
- 带教提供的原始 Markdown、JSON 和 PDF 不会被本项目修改。
- 暂不访问知识星球，也不调用 OCR、AI 或云存储。

## 预留接口

`lib/integrations/contracts.ts` 定义了知识星球采集、PDF 文字提取、OCR、AI 总结和对象存储（Cloudflare R2）的适配器边界，后续可分别实现。

## 本地运行

```bash
npm install
npm run dev
```

默认访问 `http://localhost:3000/`。
