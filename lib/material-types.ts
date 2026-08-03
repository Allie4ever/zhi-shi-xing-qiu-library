export type Route = "due-diligence" | "manager-materials";
export type Status = "待解析" | "待复核" | "已发布" | "解析失败";

export type MaterialPage = {
  pageNumber: number;
  text: string;
  charCount: number;
};

export type Material = {
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
  status: Status;
  sourceType: "built-in" | "local";
  fileName?: string;
  fileHash?: string;
  needsOcr?: boolean;
  pages?: MaterialPage[];
  fullText?: string;
  totalPages?: number;
  totalChars?: number;
  pdfBlob?: Blob;
  pdfUrl?: string;
  savePdf?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

