import { asciiSlug, shortHash } from "./slug";

export interface NoteInfo {
  path: string;
  title: string;
  mtime: number;
  size: number;
  /** thư mục con trên máy (đã slug hóa, không có / đầu-cuối); "" = đổ phẳng */
  dir?: string;
}

export interface SyncEntry {
  /** đường dẫn EPUB tương đối so với thư mục gốc trên máy, vd "03-Resources/Sach.epub" */
  epub: string;
  mtime: number;
  size: number;
}

/** đường dẫn note trong vault → file đã gửi lần trước */
export type SyncState = Record<string, SyncEntry>;

export interface UploadTask {
  note: NoteInfo;
  epub: string;
  reason: "new" | "changed" | "renamed" | "missing";
}

export interface SyncPlan {
  upload: UploadTask[];
  /** EPUB (đường dẫn tương đối) cần xóa trên máy: note ra khỏi phạm vi hoặc đổi tên/đổi thư mục */
  delete: string[];
  unchanged: number;
}

export function epubNameFor(title: string): string {
  return `${asciiSlug(title)}.epub`;
}

/** Thư mục vault → thư mục trên máy: từng cấp slug hóa để thẻ SD và máy hiện được. */
export function deviceSubdir(vaultFolder: string): string {
  return vaultFolder
    .split("/")
    .map((seg) => seg.trim())
    .filter(Boolean)
    .map((seg) => asciiSlug(seg, 40))
    .join("/");
}

export function joinRel(dir: string | undefined, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

/** Mỗi note một đường dẫn; trùng tên trong cùng thư mục thì thêm mã băm của đường dẫn vault. */
export function assignEpubNames(notes: NoteInfo[]): Map<string, string> {
  const count = new Map<string, number>();
  for (const n of notes) {
    const key = joinRel(n.dir, epubNameFor(n.title));
    count.set(key, (count.get(key) ?? 0) + 1);
  }
  const result = new Map<string, string>();
  for (const n of notes) {
    const key = joinRel(n.dir, epubNameFor(n.title));
    const unique = (count.get(key) ?? 0) > 1 ? joinRel(n.dir, `${asciiSlug(n.title)}-${shortHash(n.path)}.epub`) : key;
    result.set(n.path, unique);
  }
  return result;
}

export function planSync(
  notes: NoteInfo[],
  state: SyncState,
  deviceFiles: Set<string> | null,
  opts: { deleteRemoved: boolean },
): SyncPlan {
  const names = assignEpubNames(notes);
  const plan: SyncPlan = { upload: [], delete: [], unchanged: 0 };
  const inScope = new Set(notes.map((n) => n.path));

  for (const note of notes) {
    const epub = names.get(note.path)!;
    const prev = state[note.path];
    if (!prev) {
      plan.upload.push({ note, epub, reason: "new" });
    } else if (prev.epub !== epub) {
      plan.upload.push({ note, epub, reason: "renamed" });
      if (opts.deleteRemoved) plan.delete.push(prev.epub);
    } else if (prev.mtime !== note.mtime || prev.size !== note.size) {
      plan.upload.push({ note, epub, reason: "changed" });
    } else if (deviceFiles && !deviceFiles.has(epub)) {
      plan.upload.push({ note, epub, reason: "missing" });
    } else {
      plan.unchanged++;
    }
  }

  if (opts.deleteRemoved) {
    for (const [path, entry] of Object.entries(state)) {
      if (!inScope.has(path)) plan.delete.push(entry.epub);
    }
  }
  return plan;
}
