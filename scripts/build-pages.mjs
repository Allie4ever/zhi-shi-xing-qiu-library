import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const output = resolve(root, "pages-dist");
const source = resolve(root, "pages-src");
const curated = JSON.parse(await readFile(resolve(root, "data/materials-curated.json"), "utf8"));
const allowedFields = ["id", "route", "manager", "title", "materialDate", "strategy", "summary", "highlights", "risks", "tags", "reviewStatus"];
const materials = curated.materials.map((item) => Object.fromEntries([
  ...allowedFields.map((key) => [key, item[key]]),
  ["status", item.reviewStatus === "待复核" ? "待复核" : "已发布"],
].filter(([, value]) => value !== undefined)));
const publicPayload = JSON.stringify({ reviewedAt: curated.reviewedAt, materials }, null, 2);
if (/\/Users\/|\/private\/|file:\/\/|api[_-]?key|cookie|authorization/i.test(publicPayload)) {
  throw new Error("公开数据包含禁止发布的本地路径或凭据字段");
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });
await cp(resolve(root, "public/favicon.svg"), resolve(output, "favicon.svg"));
await writeFile(resolve(output, "materials.json"), `${publicPayload}\n`, "utf8");
await writeFile(resolve(output, ".nojekyll"), "", "utf8");
console.log(`GitHub Pages static build: ${materials.length} public records`);
