import type { HttpFn } from "./device";

/**
 * Kệ Xteink Lover: gửi EPUB lên kệ online bằng mã ứng dụng (Bearer). Máy đọc tự kéo về qua OPDS,
 * nên gửi được từ bất cứ đâu, máy không cần bật.
 * Xteink Lover shelf: upload EPUBs with an app token; the reader downloads them over OPDS.
 */
export interface ShelfBook {
  id: string;
  title: string;
  size: number;
}

export interface ShelfMe {
  user: { username: string };
  usage: { books: number; bytes: number };
  limits: { maxBooks: number; maxUploadBytes: number };
}

export class ShelfError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const TOKEN_RE = /^xlapp_[0-9a-f]{64}$/;

/** "app.example.dev/" → "https://app.example.dev". Chỉ nhận https (hoặc http cho máy local khi phát triển). */
export function normalizeShelfUrl(raw: string): string | null {
  let s = raw.trim().replace(/\/+$/, "");
  if (!s) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    if (!/^https?:\/\//i.test(s)) return null;
  } else s = "https://" + s;
  try {
    const u = new URL(s);
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function isShelfToken(token: string): boolean {
  return TOKEN_RE.test(token.trim());
}

export class ShelfClient {
  private readonly base: string;

  constructor(private readonly http: HttpFn, baseUrl: string, private readonly token: string) {
    const base = normalizeShelfUrl(baseUrl);
    if (!base) throw new ShelfError("Invalid server address", 0);
    if (!isShelfToken(token)) throw new ShelfError("Invalid app token", 0);
    this.base = base;
    this.token = token.trim();
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { Authorization: `Bearer ${this.token}`, Accept: "application/json", ...extra };
  }

  private static parse<T>(text: string): T | null {
    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }

  private static fail(status: number, text: string): ShelfError {
    const msg = ShelfClient.parse<{ error?: string }>(text)?.error;
    return new ShelfError(msg || `HTTP ${status}`, status);
  }

  async me(): Promise<ShelfMe> {
    const res = await this.http({ url: `${this.base}/api/me`, method: "GET", headers: this.headers() });
    if (res.status !== 200) throw ShelfClient.fail(res.status, res.text);
    const me = ShelfClient.parse<ShelfMe>(res.text);
    if (!me?.user) throw new ShelfError("Unexpected response", res.status);
    return me;
  }

  async list(): Promise<ShelfBook[]> {
    const res = await this.http({ url: `${this.base}/api/books`, method: "GET", headers: this.headers() });
    if (res.status !== 200) throw ShelfClient.fail(res.status, res.text);
    return ShelfClient.parse<ShelfBook[]>(res.text) ?? [];
  }

  /** Gửi một EPUB, trả về id sách trên kệ. */
  async upload(title: string, author: string | undefined, bytes: Uint8Array): Promise<string> {
    const q = `?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author ?? "")}`;
    const body = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? (bytes.buffer as ArrayBuffer) : bytes.slice().buffer;
    const res = await this.http({
      url: `${this.base}/api/books${q}`,
      method: "POST",
      headers: this.headers({ "Content-Type": "application/epub+zip" }),
      body,
    });
    if (res.status !== 201) throw ShelfClient.fail(res.status, res.text);
    const id = ShelfClient.parse<{ book?: { id?: string } }>(res.text)?.book?.id;
    if (!id) throw new ShelfError("Unexpected response", res.status);
    return id;
  }

  /** Xóa sách; sách đã không còn (xóa trên web) thì coi như xong. */
  async remove(id: string): Promise<void> {
    if (!/^[a-z0-9]{9,24}$/.test(id)) return;
    const res = await this.http({ url: `${this.base}/api/books/${id}`, method: "DELETE", headers: this.headers() });
    if (res.status !== 200 && res.status !== 404) throw ShelfClient.fail(res.status, res.text);
  }
}

// ── kế hoạch đồng bộ lên kệ (thuần, để unit test) ──

export interface ShelfEntry {
  id: string;
  mtime: number;
  size: number;
  /** gửi tay (không nằm trong phạm vi đồng bộ) → đồng bộ không tự xóa */
  manual?: boolean;
}

/** đường dẫn note trong vault → sách đã gửi lên kệ */
export type ShelfState = Record<string, ShelfEntry>;

export interface ShelfPlan {
  /** note cần gửi (mới, đã sửa, hoặc bị xóa trên web); `replace` = id cũ cần xóa sau khi gửi xong */
  upload: { path: string; replace?: string }[];
  /** note ra khỏi phạm vi: id cần xóa trên kệ */
  remove: { path: string; id: string }[];
  unchanged: number;
}

export function planShelf(
  notes: { path: string; mtime: number; size: number }[],
  state: ShelfState,
  onShelf: Set<string> | null,
  opts: { deleteRemoved: boolean },
): ShelfPlan {
  const plan: ShelfPlan = { upload: [], remove: [], unchanged: 0 };
  const inScope = new Set(notes.map((n) => n.path));
  for (const n of notes) {
    const prev = state[n.path];
    if (!prev) plan.upload.push({ path: n.path });
    else if (prev.mtime !== n.mtime || prev.size !== n.size) plan.upload.push({ path: n.path, replace: prev.id });
    else if (onShelf && !onShelf.has(prev.id)) plan.upload.push({ path: n.path });
    else plan.unchanged++;
  }
  if (opts.deleteRemoved) {
    for (const [path, e] of Object.entries(state)) if (!inScope.has(path) && !e.manual) plan.remove.push({ path, id: e.id });
  }
  return plan;
}
