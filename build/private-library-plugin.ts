import type { IncomingMessage, ServerResponse } from "node:http";
import { createReadStream } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";
import type { Plugin } from "vite";

type ArchiveRecord = {
  original_filename: string; stored_filename: string; post_title?: string; pdf_title?: string;
  author?: string; posted_at?: string; group_name?: string; group_id?: string; source_url?: string;
  post_id?: string | null; file_id?: string | null; file_size_bytes?: number; page_count?: number;
  sha256?: string; category: string; classification_basis?: string; text_extraction_status?: string;
  extracted_char_count?: number; pages_file?: string;
};

type IndexedRecord = ArchiveRecord & { id: string; pdfPath: string; pagesPath?: string };

const json = (response: ServerResponse, status: number, body: unknown) => {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(body));
};

function safePath(root: string, relative: string) {
  const target = resolve(root, relative);
  if (target !== root && !target.startsWith(`${root}${sep}`)) throw new Error("路径越界，已拒绝读取");
  return target;
}

async function buildIndex(privateRoot: string): Promise<IndexedRecord[]> {
  const metadataRoot = safePath(privateRoot, "元数据");
  const files = (await readdir(metadataRoot)).filter((name) => name.endsWith(".json")).sort();
  const byHash = new Map<string, IndexedRecord>();
  for (const name of files) {
    let records: ArchiveRecord[];
    try { records = JSON.parse(await readFile(safePath(metadataRoot, name), "utf8")); } catch { continue; }
    if (!Array.isArray(records)) continue;
    for (const record of records) {
      if (record.category !== "尽调报告" && record.category !== "路演材料") continue;
      if (!record.sha256 || !record.stored_filename) continue;
      const pdfPath = safePath(privateRoot, record.stored_filename);
      const pagesPath = record.pages_file ? safePath(privateRoot, record.pages_file) : undefined;
      byHash.set(record.sha256, { ...record, id: `private-${record.sha256}`, pdfPath, pagesPath });
    }
  }
  return Array.from(byHash.values()).sort((a, b) => (b.posted_at ?? "").localeCompare(a.posted_at ?? ""));
}

function publicRecord(record: IndexedRecord) {
  return {
    id: record.id, route: record.category === "尽调报告" ? "due-diligence" : "manager-materials",
    manager: record.pdf_title?.split(/[｜|]/)[0]?.trim() || "待人工整理",
    title: record.pdf_title || record.post_title || record.original_filename.replace(/\.pdf$/i, ""),
    materialDate: record.posted_at?.slice(0, 10) || "", materialType: record.category, strategy: "待人工整理",
    summary: "待人工整理", highlights: [], risks: [], tags: ["本机私有资料"], status: "待复核",
    sourceType: "private-local", fileName: record.original_filename, originalFileName: record.original_filename,
    fileHash: record.sha256, expectedSha256: record.sha256, fileSize: record.file_size_bytes,
    totalPages: record.page_count, totalChars: record.extracted_char_count, postTitle: record.post_title,
    postedAt: record.posted_at, fileId: record.file_id || undefined, groupName: record.group_name,
    sourceUrl: record.source_url, author: record.author, classificationBasis: record.classification_basis,
    textExtractionStatus: record.text_extraction_status, pdfAvailable: true,
    pagesAvailable: Boolean(record.pagesPath), pdfUrl: `/api/local-materials/${record.id}/pdf`,
    pagesUrl: record.pagesPath ? `/api/local-materials/${record.id}/pages` : undefined,
  };
}

function sendPdf(request: IncomingMessage, response: ServerResponse, path: string, size: number) {
  const range = request.headers.range;
  response.setHeader("accept-ranges", "bytes");
  response.setHeader("content-type", "application/pdf");
  response.setHeader("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(basename(path))}`);
  if (!range) {
    response.statusCode = 200; response.setHeader("content-length", size); createReadStream(path).pipe(response); return;
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) { response.statusCode = 416; response.setHeader("content-range", `bytes */${size}`); response.end(); return; }
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start > end || start >= size) { response.statusCode = 416; response.setHeader("content-range", `bytes */${size}`); response.end(); return; }
  response.statusCode = 206; response.setHeader("content-range", `bytes ${start}-${end}/${size}`);
  response.setHeader("content-length", end - start + 1); createReadStream(path, { start, end }).pipe(response);
}

export function privateLibraryPlugin(): Plugin {
  const privateRoot = resolve(import.meta.dirname, "../private/PDF资料");
  return { name: "private-local-library", apply: "serve", configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      const url = new URL(request.url || "/", "http://localhost");
      if (!url.pathname.startsWith("/api/local-materials")) return next();
      if (request.method !== "GET" && request.method !== "HEAD") return json(response, 405, { error: "本地资料接口为只读接口" });
      try {
        const index = await buildIndex(privateRoot);
        if (url.pathname === "/api/local-materials") return json(response, 200, index.map(publicRecord));
        const match = /^\/api\/local-materials\/([^/]+)(?:\/(pdf|pages))?$/.exec(url.pathname);
        if (!match) return json(response, 404, { error: "接口不存在" });
        const record = index.find((item) => item.id === decodeURIComponent(match[1]));
        if (!record) return json(response, 404, { error: "材料索引不存在或已被过滤" });
        if (!match[2]) return json(response, 200, publicRecord(record));
        if (match[2] === "pages") {
          if (!record.pagesPath) return json(response, 404, { error: "正文待补充：元数据未登记分页正文路径" });
          try { return json(response, 200, JSON.parse(await readFile(record.pagesPath, "utf8"))); }
          catch (error) { return json(response, 404, { error: `正文待补充：${error instanceof Error ? error.message : "文件无法读取"}` }); }
        }
        let info;
        try { info = await stat(record.pdfPath); } catch (error) { return json(response, 404, { error: `PDF文件不存在：${record.stored_filename}（${error instanceof Error ? error.message : "无法读取"}）` }); }
        if (!info.isFile()) return json(response, 404, { error: `PDF路径不是文件：${record.stored_filename}` });
        return sendPdf(request, response, record.pdfPath, info.size);
      } catch (error) { return json(response, 500, { error: error instanceof Error ? error.message : "本地资料接口失败" }); }
    });
  } };
}
