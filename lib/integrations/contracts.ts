/**
 * 第一阶段只定义边界，不发起采集、OCR、AI 或云存储请求。
 * 后续实现必须保持参考原件只读，并通过这些适配器写入新项目自己的存储。
 */
export type ProcessingStatus = "待解析" | "待复核" | "已发布" | "解析失败";

export interface SourceDocument {
  externalId: string;
  fileName: string;
  mimeType: "application/pdf";
  bytes?: ArrayBuffer;
}

export interface KnowledgePlanetCollector {
  listNewDocuments(cursor?: string): Promise<SourceDocument[]>;
}

export interface PdfTextExtractor {
  extract(document: SourceDocument): Promise<{ text: string; pageCount: number }>;
}

export interface OcrService {
  recognize(document: SourceDocument, pages?: number[]): Promise<string>;
}

export interface AiMaterialSummarizer {
  summarize(text: string): Promise<{
    summary: string;
    highlights: string[];
    risks: string[];
    tags: string[];
  }>;
}

export interface ObjectStorage {
  put(key: string, document: SourceDocument): Promise<{ objectKey: string }>;
  getPreviewUrl(objectKey: string): Promise<string>;
}
