import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { MaterialPage } from "./material-types";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
export const MAX_PDF_SIZE = 20 * 1024 * 1024;

export async function sha256(file: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function extractPdfPages(file: Blob): Promise<{ pages: MaterialPage[]; totalChars: number; needsOcr: boolean }> {
  const data = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjs.getDocument({ data }).promise;
  const pages: MaterialPage[] = [];
  let totalChars = 0;
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    totalChars += text.length;
    pages.push({ pageNumber, text, charCount: text.length });
  }
  return { pages, totalChars, needsOcr: totalChars < 20 };
}

