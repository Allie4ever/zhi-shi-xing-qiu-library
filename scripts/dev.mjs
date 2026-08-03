import { spawn } from "node:child_process";

const processes = [
  spawn("node_modules/.bin/vinext", ["dev"], {
    stdio: "inherit",
    env: { ...process.env, WRANGLER_LOG_PATH: ".wrangler/wrangler.log" },
  }),
];

let closing = false;
function close(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of processes) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 250);
}

for (const child of processes) {
  child.on("exit", (code) => {
    if (!closing && code) close(code);
  });
}
process.on("SIGINT", () => close(0));
process.on("SIGTERM", () => close(0));
