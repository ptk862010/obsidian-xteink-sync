import { buildMultipart, formUrlEncoded } from "./multipart";

/** Endpoint của CrossPoint firmware 1.6.0 (docs/webserver-endpoints.md). */
export interface DeviceStatus {
  version: string;
  ip: string;
  mode: string;
  device: string;
}

export interface DeviceEntry {
  name: string;
  size: number;
  isDirectory: boolean;
  isEpub: boolean;
}

export interface HttpRequest {
  url: string;
  method: "GET" | "POST" | "DELETE";
  headers?: Record<string, string>;
  body?: string | ArrayBuffer;
}

export interface HttpResponse {
  status: number;
  text: string;
}

/** Tách lớp HTTP để test không cần Obsidian; trong plugin dùng requestUrl. */
export type HttpFn = (req: HttpRequest) => Promise<HttpResponse>;

export class DeviceError extends Error {}

/**
 * Đường dẫn trên máy phải tuyệt đối và không có đoạn "." / ".." (phòng data.json bị sửa tay hoặc hỏng):
 * plugin không được đụng file ngoài thư mục của nó.
 */
export function assertSafeDevicePath(path: string): string {
  if (!path.startsWith("/") || path.split("/").some((seg) => seg === "." || seg === "..") || /[\\\0\r\n]/.test(path)) {
    throw new DeviceError(`Unsafe path on the reader: ${path}`);
  }
  return path;
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new DeviceError(`${what}: quá ${ms / 1000}s không phản hồi`)), ms);
    p.then(
      (v) => {
        window.clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

export class CrossPointClient {
  constructor(
    private readonly http: HttpFn,
    public readonly host: string,
    private readonly timeoutMs = 5000,
    private readonly uploadTimeoutMs = 300000,
  ) {}

  private url(path: string): string {
    return `http://${this.host}${path}`;
  }

  async status(): Promise<DeviceStatus> {
    const res = await withTimeout(this.http({ url: this.url("/api/status"), method: "GET" }), this.timeoutMs, "Kiểm tra máy");
    if (res.status !== 200) throw new DeviceError(`/api/status trả về ${res.status}`);
    return JSON.parse(res.text) as DeviceStatus;
  }

  async listFiles(dir: string): Promise<DeviceEntry[]> {
    const res = await withTimeout(
      this.http({ url: this.url(`/api/files?path=${encodeURIComponent(assertSafeDevicePath(dir))}`), method: "GET" }),
      this.timeoutMs,
      "Đọc danh sách file",
    );
    if (res.status === 404) return [];
    if (res.status !== 200) throw new DeviceError(`/api/files trả về ${res.status}`);
    return JSON.parse(res.text) as DeviceEntry[];
  }

  async mkdir(parent: string, name: string): Promise<void> {
    // Thư mục đã có thì máy báo lỗi — bỏ qua, listFiles sẽ xác nhận sau.
    await withTimeout(
      this.http({
        url: this.url("/mkdir"),
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formUrlEncoded({ name: assertSafeDevicePath("/" + name).slice(1), path: assertSafeDevicePath(parent) }),
      }),
      this.timeoutMs,
      "Tạo thư mục",
    );
  }

  async ensureDir(dir: string): Promise<void> {
    const parent = dir.slice(0, dir.lastIndexOf("/")) || "/";
    const name = dir.slice(dir.lastIndexOf("/") + 1);
    if (!name) return;
    const entries = await this.listFiles(parent);
    if (entries.some((e) => e.isDirectory && e.name === name)) return;
    await this.mkdir(parent, name);
  }

  /** Tạo lần lượt từng cấp: /Obsidian/03-Resources/Books */
  async ensureDirRecursive(dir: string): Promise<void> {
    const parts = dir.split("/").filter(Boolean);
    let current = "";
    for (const p of parts) {
      current += "/" + p;
      await this.ensureDir(current);
    }
  }

  /** Mọi file dưới dir (đệ quy), trả về đường dẫn tương đối so với dir. */
  async listFilesRecursive(dir: string): Promise<string[]> {
    const out: string[] = [];
    const walk = async (abs: string, rel: string): Promise<void> => {
      for (const e of await this.listFiles(abs)) {
        const childRel = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory) await walk(`${abs}/${e.name}`, childRel);
        else out.push(childRel);
      }
    };
    await walk(dir, "");
    return out;
  }

  async upload(dir: string, fileName: string, bytes: Uint8Array): Promise<void> {
    const { body, contentType } = buildMultipart("file", fileName, bytes, "application/epub+zip");
    const res = await withTimeout(
      this.http({
        url: this.url(`/upload?path=${encodeURIComponent(assertSafeDevicePath(dir))}`),
        method: "POST",
        headers: { "Content-Type": contentType },
        body,
      }),
      this.uploadTimeoutMs,
      `Gửi ${fileName}`,
    );
    if (res.status !== 200) throw new DeviceError(`Gửi ${fileName} lỗi ${res.status}: ${res.text.slice(0, 120)}`);
  }

  async delete(path: string): Promise<void> {
    const res = await withTimeout(
      this.http({
        url: this.url("/delete"),
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formUrlEncoded({ path: assertSafeDevicePath(path) }),
      }),
      this.timeoutMs,
      `Xóa ${path}`,
    );
    if (res.status !== 200) throw new DeviceError(`Xóa ${path} lỗi ${res.status}: ${res.text.slice(0, 120)}`);
  }
}

/** Thử lần lượt các địa chỉ (crosspoint.local, IP nhớ lần trước...) — máy chỉ trả lời khi đang ở File Transfer. */
export async function findDevice(
  http: HttpFn,
  candidates: string[],
  timeoutMs = 4000,
): Promise<{ client: CrossPointClient; status: DeviceStatus } | null> {
  const seen = new Set<string>();
  for (const host of candidates.map((h) => h.trim()).filter(Boolean)) {
    if (seen.has(host)) continue;
    seen.add(host);
    const client = new CrossPointClient(http, host, timeoutMs);
    try {
      const status = await client.status();
      return { client, status };
    } catch {
      /* thử địa chỉ tiếp theo */
    }
  }
  return null;
}
