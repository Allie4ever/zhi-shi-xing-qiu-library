import { access } from "node:fs/promises";

const bundled =
  "/Users/allie4ever/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";

export async function resolvePython() {
  if (process.env.MATERIAL_LIBRARY_PYTHON) return process.env.MATERIAL_LIBRARY_PYTHON;
  try {
    await access(bundled);
    return bundled;
  } catch {
    return "python3";
  }
}
