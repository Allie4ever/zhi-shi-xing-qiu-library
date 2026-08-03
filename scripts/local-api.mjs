import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolvePython } from "./python_runtime.mjs";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const privateRoot = join(root, "private");
const storePath = join(privateRoot, "data", "materials.json");
const tempDir = join(privateRoot, "tmp");
const port = Number(process.env.MATERIAL_LIBRARY_API_PORT || 3001);

await mkdir(join(privateRoot, "data"), { recursive: true });
await mkdir(join(privateRoot, "uploads"), { recursive: true });
await mkdir(tempDir, { recursive: true });

async function records() {
  try {
    return JSON.parse(await readFile(storePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function saveRecords(items) {
  await writeFile(storePath, `${JSON.stringify(items, null, 2)}\n`, "utf8");
}

function json(res, status, value) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "http://localhost:3000",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(JSON.stringify(value));
}

async function body(req, limit = 80 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("文件超过80MB限制");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function multipartFile(buffer, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  if (!match) throw new Error("上传请求缺少multipart boundary");
  const boundary = Buffer.from(`--${match[1] || match[2]}`);
  const start = buffer.indexOf(boundary);
  const headerEnd = buffer.indexOf(Buffer.from("\r\n\r\n"), start);
  if (start < 0 || headerEnd < 0) throw new Error("无法读取上传文件");
  const headers = buffer.subarray(start + boundary.length + 2, headerEnd).toString("utf8");
  const nameMatch = /filename="([^"]*)"/i.exec(headers);
  if (!nameMatch) throw new Error("上传请求中没有文件");
  const dataStart = headerEnd + 4;
  const nextBoundary = buffer.indexOf(boundary, dataStart);
  if (nextBoundary < 0) throw new Error("上传文件不完整");
  return {
    fileName: nameMatch[1],
    data: buffer.subarray(dataStart, nextBoundary - 2),
  };
}

async function runParser(args) {
  const python = await resolvePython();
  return new Promise((resolvePromise, reject) => {
    const child = spawn(python, ["scripts/parse_pdf.py", ...args], { cwd: root });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("exit", (code) => {
      if (code !== 0) return reject(new Error(stderr.trim() || "PDF解析进程失败"));
      try {
        resolvePromise(JSON.parse(stdout.trim()));
      } catch {
        reject(new Error("PDF解析结果格式错误"));
      }
    });
  });
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") return json(res, 204, {});
    const url = new URL(req.url, `http://localhost:${port}`);

    if (req.method === "GET" && url.pathname === "/api/health") {
      return json(res, 200, { ok: true, storage: "private/local" });
    }
    if (req.method === "GET" && url.pathname === "/api/materials") {
      return json(res, 200, { materials: await records() });
    }
    if (req.method === "POST" && url.pathname === "/api/materials/upload") {
      const route = url.searchParams.get("route");
      if (!["due-diligence", "manager-materials"].includes(route)) {
        return json(res, 400, { error: "请选择尽调报告或路演材料" });
      }
      const upload = multipartFile(await body(req), req.headers["content-type"]);
      if (extname(upload.fileName).toLowerCase() !== ".pdf") {
        return json(res, 400, { error: "仅支持PDF文件" });
      }
      const signature = upload.data.subarray(0, 5).toString("ascii");
      if (signature !== "%PDF-") return json(res, 400, { error: "文件内容不是有效PDF" });
      const digest = createHash("sha256").update(upload.data).digest("hex");
      const tempPath = join(tempDir, `${digest}.pdf`);
      await writeFile(tempPath, upload.data);
      try {
        const result = await runParser([
          "--file", tempPath,
          "--route", route,
          "--original-name", upload.fileName,
          "--ingest-only",
        ]);
        return json(res, result.duplicate ? 409 : 201, result);
      } finally {
        await unlink(tempPath).catch(() => {});
      }
    }
    const parseMatch = /^\/api\/materials\/([^/]+)\/parse$/.exec(url.pathname);
    if (req.method === "POST" && parseMatch) {
      const result = await runParser(["--record-id", decodeURIComponent(parseMatch[1])]);
      return json(res, 200, result);
    }
    const renameMatch = /^\/api\/materials\/([^/]+)\/rename$/.exec(url.pathname);
    if (req.method === "POST" && renameMatch) {
      const payload = JSON.parse((await body(req, 16 * 1024)).toString("utf8") || "{}");
      const title = typeof payload.title === "string"
        ? payload.title.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()
        : "";
      if (!title) return json(res, 400, { error: "标题不能为空" });
      if (title.length > 200) return json(res, 400, { error: "标题不能超过200个字符" });
      const items = await records();
      const record = items.find((item) => item.id === decodeURIComponent(renameMatch[1]));
      if (!record) return json(res, 404, { error: "材料不存在" });
      record.title = title;
      record.updatedAt = new Date().toISOString();
      await saveRecords(items);
      return json(res, 200, { record });
    }
    const publishMatch = /^\/api\/materials\/([^/]+)\/publish$/.exec(url.pathname);
    if (req.method === "POST" && publishMatch) {
      const items = await records();
      const record = items.find((item) => item.id === decodeURIComponent(publishMatch[1]));
      if (!record) return json(res, 404, { error: "材料不存在" });
      if (record.status !== "待复核") return json(res, 409, { error: "只有待复核材料可以发布" });
      const timestamp = new Date().toISOString();
      record.status = "已发布";
      record.updatedAt = timestamp;
      record.statusHistory.push({ status: "已发布", at: timestamp });
      await saveRecords(items);
      return json(res, 200, { record });
    }
    const pdfMatch = /^\/api\/materials\/([^/]+)\/pdf$/.exec(url.pathname);
    if (req.method === "GET" && pdfMatch) {
      const item = (await records()).find((record) => record.id === decodeURIComponent(pdfMatch[1]));
      if (!item) return json(res, 404, { error: "材料不存在" });
      const pdfPath = resolve(root, item.storedFile);
      if (!pdfPath.startsWith(resolve(privateRoot))) return json(res, 403, { error: "非法文件路径" });
      res.writeHead(200, {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(item.fileName)}`,
        "access-control-allow-origin": "http://localhost:3000",
        "cache-control": "private, no-store",
      });
      return createReadStream(pdfPath).pipe(res);
    }
    return json(res, 404, { error: "接口不存在" });
  } catch (error) {
    return json(res, 500, { error: error.message || "本地服务发生错误" });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Local material API: http://localhost:${port}`);
});
