import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function walk(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    if (["node_modules", "dist", "build", ".git"].includes(entry.name)) return [];
    const fullPath = join(path, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}
let checked = 0;
for (const file of walk(".")) {
  if (!file.endsWith(".js")) continue;
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${file}: ${result.stderr}`);
  for (const match of readFileSync(file, "utf8").matchAll(/(?:from\s+|import\s*)["'](\.[^"']+)["']/g)) {
    if (!existsSync(resolve(dirname(file), match[1]))) throw new Error(`Missing import in ${file}: ${match[1]}`);
  }
  checked++;
}
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
for (const file of [manifest.background.service_worker, manifest.action.default_popup, manifest.options_page,
  ...manifest.content_scripts.flatMap((script) => script.js)]) {
  if (!existsSync(file)) throw new Error(`Missing manifest resource: ${file}`);
}
console.log(`Syntax/import checks passed: ${checked} JavaScript files; manifest resources present.`);
