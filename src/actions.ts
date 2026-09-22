import { Notice, TFile, getAllTags } from "obsidian";
import type XteinkSyncPlugin from "./main";
import { noteToEpub } from "./render";
import { NoteInfo, deviceSubdir, epubNameFor, joinRel, planSync } from "./sync";
import type { CrossPointClient } from "./device";

function titleOf(plugin: XteinkSyncPlugin, f: TFile): string {
  const t = plugin.app.metadataCache.getFileCache(f)?.frontmatter?.title;
  if (typeof t !== "string" || !t.trim()) return f.basename;
  return t.trim().replace(/\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_m, a: string, b?: string) => b ?? a);
}

/** Thư mục con trên máy cho note này ("" nếu đổ phẳng). */
function subdirOf(plugin: XteinkSyncPlugin, f: TFile): string {
  if (!plugin.settings.mirrorFolders) return "";
  const parent = f.parent?.path ?? "";
  return parent === "/" ? "" : deviceSubdir(parent);
}

function splitRel(rel: string): { dir: string; name: string } {
  const i = rel.lastIndexOf("/");
  return i < 0 ? { dir: "", name: rel } : { dir: rel.slice(0, i), name: rel.slice(i + 1) };
}

/** Gửi một EPUB (đường dẫn tương đối) vào đúng thư mục trên máy, tạo thư mục nếu thiếu. */
async function uploadRel(plugin: XteinkSyncPlugin, client: CrossPointClient, rel: string, bytes: Uint8Array, made: Set<string>): Promise<void> {
  const { dir, name } = splitRel(rel);
  const target = dir ? `${plugin.deviceDir}/${dir}` : plugin.deviceDir;
  if (!made.has(target)) {
    await client.ensureDirRecursive(target);
    made.add(target);
  }
  await client.upload(target, name, bytes);
}

/** Chế độ 1: gửi tay. Máy tắt thì để vào hộp thư, gửi sau. */
export async function sendNotes(plugin: XteinkSyncPlugin, files: TFile[]): Promise<void> {
  const opts = plugin.renderOptions();
  const progress = new Notice(`Đang chuyển ${files.length} note…`, 0);
  const made = new Set<string>();
  try {
    const client = await plugin.connect();
    let sent = 0;
    let queued = 0;
    for (const [i, file] of files.entries()) {
      progress.setMessage(`(${i + 1}/${files.length}) ${file.basename}`);
      const { bytes, title } = await noteToEpub(plugin.app, file, opts);
      const rel = joinRel(subdirOf(plugin, file), epubNameFor(title));
      if (client) {
        await uploadRel(plugin, client, rel, bytes, made);
        sent++;
      } else {
        await plugin.outbox.put(rel, bytes);
        queued++;
      }
    }
    if (client) new Notice(`Đã gửi ${sent} note sang Xteink (/${plugin.settings.deviceFolder}).`);
    else new Notice(`Xteink chưa bật File Transfer → ${queued} note đang chờ trong hộp thư. Bật máy rồi chạy "Gửi hộp thư".`, 8000);
  } finally {
    progress.hide();
  }
}

export async function sendOutbox(plugin: XteinkSyncPlugin): Promise<void> {
  const pending = await plugin.outbox.list();
  if (!pending.length) {
    new Notice("Hộp thư trống.");
    return;
  }
  const client = await plugin.connect();
  if (!client) {
    new Notice(`Xteink chưa bật File Transfer — ${pending.length} file vẫn chờ.`, 6000);
    return;
  }
  const progress = new Notice("", 0);
  const made = new Set<string>();
  let sent = 0;
  try {
    for (const [i, rel] of pending.entries()) {
      progress.setMessage(`Hộp thư (${i + 1}/${pending.length}) ${rel}`);
      await uploadRel(plugin, client, rel, await plugin.outbox.read(rel), made);
      await plugin.outbox.remove(rel);
      sent++;
    }
  } finally {
    progress.hide();
    new Notice(`Đã gửi ${sent}/${pending.length} file từ hộp thư.`);
  }
}

/** Note thuộc thư mục hoặc mang tag đã cấu hình. */
export function collectScope(plugin: XteinkSyncPlugin): TFile[] {
  const { syncFolders, syncTag } = plugin.settings;
  const tag = syncTag ? "#" + syncTag.toLowerCase() : "";
  return plugin.app.vault.getMarkdownFiles().filter((f) => {
    if (syncFolders.some((d) => f.path === d || f.path.startsWith(d + "/"))) return true;
    if (!tag) return false;
    const cache = plugin.app.metadataCache.getFileCache(f);
    return !!cache && (getAllTags(cache) ?? []).some((t) => t.toLowerCase() === tag);
  });
}

/** Chế độ 2: bấm một cái, chỉ gửi note mới/đã sửa, tùy chọn xóa note đã bỏ. */
export async function syncNow(plugin: XteinkSyncPlugin): Promise<void> {
  const files = collectScope(plugin);
  if (!files.length) {
    new Notice("Chưa có gì để đồng bộ — vào cài đặt chọn thư mục hoặc tag.", 6000);
    return;
  }
  const client = await plugin.connect();
  if (!client) {
    new Notice("Xteink chưa bật File Transfer → Join Network. Bật rồi bấm lại.", 6000);
    return;
  }
  await client.ensureDirRecursive(plugin.deviceDir);
  const onDevice = new Set(await client.listFilesRecursive(plugin.deviceDir));
  const notes: NoteInfo[] = files.map((f) => ({
    path: f.path,
    title: titleOf(plugin, f),
    mtime: f.stat.mtime,
    size: f.stat.size,
    dir: subdirOf(plugin, f),
  }));
  const state = plugin.settings.syncState;
  const plan = planSync(notes, state, onDevice, { deleteRemoved: plugin.settings.deleteRemoved });
  if (!plan.upload.length && !plan.delete.length) {
    new Notice(`Xteink đã cập nhật — ${plan.unchanged} note không đổi.`);
    return;
  }

  const progress = new Notice("", 0);
  const opts = plugin.renderOptions();
  const made = new Set<string>([plugin.deviceDir]);
  let done = 0;
  let deleted = 0;
  try {
    for (const task of plan.upload) {
      const file = plugin.app.vault.getFileByPath(task.note.path);
      if (!file) continue;
      progress.setMessage(`Đồng bộ (${done + 1}/${plan.upload.length}) ${task.note.title}`);
      const { bytes } = await noteToEpub(plugin.app, file, opts);
      await uploadRel(plugin, client, task.epub, bytes, made);
      state[task.note.path] = { epub: task.epub, mtime: task.note.mtime, size: task.note.size };
      await plugin.saveSettings();
      done++;
    }
    const inScope = new Set(files.map((f) => f.path));
    for (const rel of plan.delete) {
      progress.setMessage(`Xóa trên máy: ${rel}`);
      if (onDevice.has(rel)) await client.delete(`${plugin.deviceDir}/${rel}`);
      deleted++;
    }
    if (plugin.settings.deleteRemoved) {
      for (const path of Object.keys(state)) if (!inScope.has(path)) delete state[path];
      await plugin.saveSettings();
    }
  } finally {
    progress.hide();
    new Notice(`Xteink: gửi ${done}/${plan.upload.length}, xóa ${deleted}, giữ nguyên ${plan.unchanged}.`, 6000);
  }
}
