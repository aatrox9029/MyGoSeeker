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
  if (!/\.m?js$/.test(file)) continue;
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${file}: ${result.stderr}`);
  for (const match of readFileSync(file, "utf8").matchAll(/(?:from\s+|import\s*)["'](\.[^"']+)["']/g)) {
    if (!existsSync(resolve(dirname(file), match[1]))) throw new Error(`Missing import in ${file}: ${match[1]}`);
  }
  checked++;
}
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const pkg = JSON.parse(readFileSync("package.json", "utf8")), lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
if ([manifest.version, pkg.version, lock.version, lock.packages[""].version].some((value) => value !== "1.0.2")) throw new Error("Project version must remain 1.0.2");
for (const file of [manifest.background.service_worker, manifest.action.default_popup, manifest.options_page,
  ...manifest.content_scripts.flatMap((script) => script.js)]) {
  if (!existsSync(file)) throw new Error(`Missing manifest resource: ${file}`);
}
console.log(`Syntax/import checks passed: ${checked} JavaScript files; manifest resources present.`);
