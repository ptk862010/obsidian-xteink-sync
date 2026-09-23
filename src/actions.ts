import { Notice, TFile, getAllTags } from "obsidian";
import { t } from "./i18n";
import type XteinkSyncPlugin from "./main";
import { noteToEpub } from "./render";
import { ShelfClient, planShelf } from "./shelf";
import { NoteInfo, deviceSubdir, epubNameFor, joinRel, planSync } from "./sync";
import type { CrossPointClient } from "./device";

function titleOf(plugin: XteinkSyncPlugin, f: TFile): string {
  const title: unknown = plugin.app.metadataCache.getFileCache(f)?.frontmatter?.title;
  if (typeof title !== "string" || !title.trim()) return f.basename;
  return title.trim().replace(/\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_m, a: string, b?: string) => b ?? a);
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

/** Chế độ 1: gửi tay. */
export async function sendNotes(plugin: XteinkSyncPlugin, files: TFile[]): Promise<void> {
  if (plugin.settings.target === "shelf") return sendNotesToShelf(plugin, files);
  const L = t();
  const opts = plugin.renderOptions();
  const progress = new Notice(L.converting(files.length), 0);
  const made = new Set<string>();
  try {
    // Máy tắt thì để vào hộp thư, gửi sau
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
    if (client) new Notice(L.sentDevice(sent, plugin.settings.deviceFolder));
    else new Notice(L.queued(queued), 8000);
  } finally {
    progress.hide();
  }
}

/** Gửi tay lên kệ: gửi lại note đã gửi thì thay bản cũ trên kệ (không để trùng). */
async function sendNotesToShelf(plugin: XteinkSyncPlugin, files: TFile[]): Promise<void> {
  const shelf = plugin.shelf();
  if (!shelf) return;
  const L = t();
  const opts = plugin.renderOptions();
  const state = plugin.settings.shelfState;
  const progress = new Notice(L.converting(files.length), 0);
  let sent = 0;
  try {
    for (const [i, file] of files.entries()) {
      progress.setMessage(`(${i + 1}/${files.length}) ${file.basename}`);
      const { bytes, title, author } = await noteToEpub(plugin.app, file, opts);
      const id = await shelf.upload(title, author, bytes);
      const prev = state[file.path];
      state[file.path] = { id, mtime: file.stat.mtime, size: file.stat.size, manual: prev ? prev.manual : true };
      await plugin.saveSettings();
      sent++;
      if (prev && prev.id !== id) await removeQuietly(shelf, prev.id);
    }
    new Notice(L.shelfSent(sent));
  } finally {
    progress.hide();
  }
}

/** Bản cũ không xóa được (mất mạng…) thì để lại trên kệ, không làm hỏng lượt gửi. */
async function removeQuietly(shelf: ShelfClient, id: string): Promise<boolean> {
  try {
    await shelf.remove(id);
    return true;
  } catch (e) {
    console.warn("[xteink-sync] could not remove old copy", id, e);
    return false;
  }
}

export async function sendOutbox(plugin: XteinkSyncPlugin): Promise<void> {
  const L = t();
  const pending = await plugin.outbox.list();
  if (!pending.length) {
    new Notice(L.outboxEmpty);
    return;
  }
  const client = await plugin.connect();
  if (!client) {
    new Notice(L.outboxStillWaiting(pending.length), 6000);
    return;
  }
  const progress = new Notice("", 0);
  const made = new Set<string>();
  let sent = 0;
  try {
    for (const [i, rel] of pending.entries()) {
      progress.setMessage(L.outboxProgress(i + 1, pending.length, rel));
      await uploadRel(plugin, client, rel, await plugin.outbox.read(rel), made);
      await plugin.outbox.remove(rel);
      sent++;
    }
  } finally {
    progress.hide();
    new Notice(L.outboxDone(sent, pending.length));
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
    return !!cache && (getAllTags(cache) ?? []).some((x) => x.toLowerCase() === tag);
  });
}

/** Chế độ 2: bấm một cái, chỉ gửi note mới/đã sửa, tùy chọn xóa note đã bỏ. */
export async function syncNow(plugin: XteinkSyncPlugin): Promise<void> {
  const files = collectScope(plugin);
  if (!files.length) {
    new Notice(t().nothingToSync, 6000);
    return;
  }
  if (plugin.settings.target === "shelf") return syncShelf(plugin, files);
  return syncDevice(plugin, files);
}

async function syncDevice(plugin: XteinkSyncPlugin, files: TFile[]): Promise<void> {
  const L = t();
  const client = await plugin.connect();
  if (!client) {
    new Notice(L.deviceNotFound, 6000);
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
    new Notice(L.upToDate(plan.unchanged));
    return;
  }

  const progress = new Notice("", 0);
  const opts = plugin.renderOptions();
  const made = new Set<string>([plugin.deviceDir]);
  let done = 0;
  let deleted = 0;
  const failed = new Set<string>();
  try {
    for (const task of plan.upload) {
      const file = plugin.app.vault.getFileByPath(task.note.path);
      if (!file) continue;
      progress.setMessage(L.syncProgress(done + 1, plan.upload.length, task.note.title));
      const { bytes } = await noteToEpub(plugin.app, file, opts);
      await uploadRel(plugin, client, task.epub, bytes, made);
      state[task.note.path] = { epub: task.epub, mtime: task.note.mtime, size: task.note.size };
      await plugin.saveSettings();
      done++;
    }
    // Xóa từng file riêng: một file lỗi không chặn các file khác, và không làm kẹt lịch sử đồng bộ
    for (const rel of plan.delete) {
      progress.setMessage(L.deleting(rel));
      try {
        if (onDevice.has(rel)) await client.delete(`${plugin.deviceDir}/${rel}`);
        deleted++;
      } catch (e) {
        console.warn("[xteink-sync] delete failed", rel, e);
        failed.add(rel);
      }
    }
    if (plugin.settings.deleteRemoved) {
      const inScope = new Set(files.map((f) => f.path));
      for (const [path, entry] of Object.entries(state)) if (!inScope.has(path) && !failed.has(entry.epub)) delete state[path];
      await plugin.saveSettings();
    }
  } finally {
    progress.hide();
    new Notice(L.syncDone(done, plan.upload.length, deleted, plan.unchanged, failed.size), 6000);
  }
}

async function syncShelf(plugin: XteinkSyncPlugin, files: TFile[]): Promise<void> {
  const shelf = plugin.shelf();
  if (!shelf) return;
  const L = t();
  const onShelf = new Set((await shelf.list()).map((b) => b.id));
  const state = plugin.settings.shelfState;
  const plan = planShelf(
    files.map((f) => ({ path: f.path, mtime: f.stat.mtime, size: f.stat.size })),
    state,
    onShelf,
    { deleteRemoved: plugin.settings.deleteRemoved },
  );
  if (!plan.upload.length && !plan.remove.length) {
    new Notice(L.upToDate(plan.unchanged));
    return;
  }

  const progress = new Notice("", 0);
  const opts = plugin.renderOptions();
  let done = 0;
  let deleted = 0;
  let failed = 0;
  try {
    for (const task of plan.upload) {
      const file = plugin.app.vault.getFileByPath(task.path);
      if (!file) continue;
      progress.setMessage(L.syncProgress(done + 1, plan.upload.length, file.basename));
      const { bytes, title, author } = await noteToEpub(plugin.app, file, opts);
      const id = await shelf.upload(title, author, bytes);
      state[task.path] = { id, mtime: file.stat.mtime, size: file.stat.size };
      await plugin.saveSettings();
      done++;
      if (task.replace && task.replace !== id && !(await removeQuietly(shelf, task.replace))) failed++;
    }
    for (const r of plan.remove) {
      progress.setMessage(L.deleting(r.path));
      if (await removeQuietly(shelf, r.id)) {
        delete state[r.path];
        deleted++;
      } else failed++;
    }
    await plugin.saveSettings();
  } finally {
    progress.hide();
    new Notice(L.syncDone(done, plan.upload.length, deleted, plan.unchanged, failed), 6000);
  }
}
