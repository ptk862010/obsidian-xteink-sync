// Copy the build into a vault and enable it. Usage: node scripts/install-vault.mjs <path-to-vault>
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const vault = process.argv[2];
if (!vault) {
  console.error("Usage: npm run install-vault -- <path-to-vault>");
  process.exit(1);
}
const id = JSON.parse(readFileSync("manifest.json", "utf8")).id;
const dest = join(vault, ".obsidian", "plugins", id);
mkdirSync(dest, { recursive: true });
for (const f of ["main.js", "manifest.json"]) {
  if (!existsSync(f)) throw new Error(`Thiếu ${f} — chạy npm run build trước`);
  copyFileSync(f, join(dest, f));
}
const listPath = join(vault, ".obsidian", "community-plugins.json");
const list = existsSync(listPath) ? JSON.parse(readFileSync(listPath, "utf8")) : [];
if (!Array.isArray(list)) throw new Error("community-plugins.json không phải mảng");
if (!list.includes(id)) {
  list.push(id);
  writeFileSync(listPath, JSON.stringify(list, null, 2) + "\n");
  console.log(`Đã thêm ${id} vào community-plugins.json`);
}
console.log(`Đã cài vào ${dest}`);
