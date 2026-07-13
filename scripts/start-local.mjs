import { spawn } from "node:child_process";

const bridge = spawn(process.execPath, ["bridge.mjs"], { stdio: "inherit" });
const datasets = spawn(process.execPath, ["dataset-bridge.mjs"], { stdio: "inherit" });
const site = spawn("npm", ["run", "dev"], { stdio: "inherit", shell: process.platform === "win32" });
function stop() { bridge.kill("SIGTERM"); datasets.kill("SIGTERM"); site.kill("SIGTERM"); }
process.on("SIGINT", stop); process.on("SIGTERM", stop);
site.on("exit", (code) => { bridge.kill("SIGTERM"); datasets.kill("SIGTERM"); process.exitCode = code ?? 0; });
