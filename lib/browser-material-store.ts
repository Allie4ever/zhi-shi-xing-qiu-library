import type { Material } from "./material-types";

const DB_NAME = "zhi-shi-xing-qiu-library";
const DB_VERSION = 2;
const STORE_NAME = "materials";
const DELETED_STORE_NAME = "deletedMaterials";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("fileHash", "fileHash", { unique: true });
      }
      if (!db.objectStoreNames.contains(DELETED_STORE_NAME)) {
        db.createObjectStore(DELETED_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开浏览器材料库"));
  });
}

async function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = run(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("浏览器材料库操作失败"));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => reject(transaction.error ?? new Error("浏览器材料库事务失败"));
  });
}

async function transactDeleted<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(DELETED_STORE_NAME, mode);
    const request = run(transaction.objectStore(DELETED_STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("删除记录保存失败"));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => reject(transaction.error ?? new Error("删除记录事务失败"));
  });
}

export function listLocalMaterials() {
  return transact<Material[]>("readonly", (store) => store.getAll());
}

export function getLocalMaterial(id: string) {
  return transact<Material | undefined>("readonly", (store) => store.get(id));
}

export function findLocalMaterialByHash(hash: string) {
  return transact<Material | undefined>("readonly", (store) => store.index("fileHash").get(hash));
}

export function saveLocalMaterial(material: Material) {
  return transact<IDBValidKey>("readwrite", (store) => store.put(material));
}

export function deleteLocalMaterial(id: string) {
  return transact<undefined>("readwrite", (store) => store.delete(id));
}

export async function listDeletedMaterialIds() {
  const records = await transactDeleted<Array<{ id: string }>>("readonly", (store) => store.getAll());
  return records.map((record) => record.id);
}

export function markMaterialDeleted(id: string) {
  return transactDeleted<IDBValidKey>("readwrite", (store) => store.put({ id, deletedAt: new Date().toISOString() }));
}

export async function deleteMaterialPersistently(id: string, deleteLocalRecord: boolean) {
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME, DELETED_STORE_NAME], "readwrite");
    transaction.objectStore(DELETED_STORE_NAME).put({ id, deletedAt: new Date().toISOString() });
    if (deleteLocalRecord) transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error("删除操作未完成")); };
    transaction.onerror = () => reject(transaction.error ?? new Error("删除操作失败"));
  });
}

export function clearLocalMaterials() {
  return transact<undefined>("readwrite", (store) => store.clear());
}

export async function ensureStorageCapacity(bytesNeeded: number) {
  if (!navigator.storage?.estimate) return;
  const estimate = await navigator.storage.estimate();
  if (estimate.quota && estimate.usage != null && estimate.quota - estimate.usage < bytesNeeded * 1.15) {
    throw new Error("浏览器可用存储空间不足。请导出备份并清理本地材料后再试。 ");
  }
}

export type BackupFile = {
  format: "zhi-shi-xing-qiu-library-backup";
  version: 1;
  exportedAt: string;
  materials: Array<Omit<Material, "pdfBlob" | "pdfUrl"> & { pdfBase64?: string }>;
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("PDF备份编码失败"));
    reader.readAsDataURL(blob);
  });
}

export async function createBackup(materials: Material[]): Promise<BackupFile> {
  const records = [];
  for (const material of materials) {
    const { pdfBlob, ...metadataWithUrl } = material;
    const metadata = { ...metadataWithUrl };
    delete metadata.pdfUrl;
    records.push({ ...metadata, ...(pdfBlob ? { pdfBase64: await blobToBase64(pdfBlob) } : {}) });
  }
  return { format: "zhi-shi-xing-qiu-library-backup", version: 1, exportedAt: new Date().toISOString(), materials: records };
}

export function restoreBackupRecord(record: BackupFile["materials"][number]): Material {
  const { pdfBase64, ...material } = record;
  let pdfBlob: Blob | undefined;
  if (pdfBase64) {
    const binary = atob(pdfBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    pdfBlob = new Blob([bytes], { type: "application/pdf" });
  }
  return { ...material, sourceType: "local", ...(pdfBlob ? { pdfBlob } : {}) } as Material;
}
