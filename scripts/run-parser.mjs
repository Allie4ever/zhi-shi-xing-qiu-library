import { spawn } from "node:child_process";
import { resolvePython } from "./python_runtime.mjs";

const python = await resolvePython();
const child = spawn(python, ["scripts/parse_pdf.py", ...process.argv.slice(2)], {
  cwd: new URL("../", import.meta.url),
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 1));
