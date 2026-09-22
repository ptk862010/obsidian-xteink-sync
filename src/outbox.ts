import { App, normalizePath } from "obsidian";

/**
 * Hộp thư: EPUB chờ gửi khi máy chưa bật File Transfer, nằm trong thư mục plugin.
 * Tên file là đường dẫn tương đối so với thư mục gốc trên máy (có thể có thư mục con).
 */
export class Outbox {
  private readonly dir: string;

  constructor(private readonly app: App, dir: string) {
    this.dir = normalizePath(dir);
  }

  private async ensureDir(path: string): Promise<void> {
    const parts = path.split("/").filter(Boolean);
    let current = "";
    for (const p of parts) {
      current = current ? `${current}/${p}` : p;
      if (!(await this.app.vault.adapter.exists(current))) await this.app.vault.adapter.mkdir(current);
    }
  }

  async put(rel: string, bytes: Uint8Array): Promise<void> {
    const full = `${this.dir}/${rel}`;
    await this.ensureDir(full.slice(0, full.lastIndexOf("/")));
    await this.app.vault.adapter.writeBinary(full, bytes.buffer as ArrayBuffer);
  }

  /** Đường dẫn tương đối của mọi EPUB đang chờ, kể cả trong thư mục con. */
  async list(): Promise<string[]> {
    if (!(await this.app.vault.adapter.exists(this.dir))) return [];
    const out: string[] = [];
    const walk = async (abs: string): Promise<void> => {
      const { files, folders } = await this.app.vault.adapter.list(abs);
      for (const f of files) if (f.toLowerCase().endsWith(".epub")) out.push(f.slice(this.dir.length + 1));
      for (const d of folders) await walk(d);
    };
    await walk(this.dir);
    return out.sort();
  }

  async read(rel: string): Promise<Uint8Array> {
    return new Uint8Array(await this.app.vault.adapter.readBinary(`${this.dir}/${rel}`));
  }

  async remove(rel: string): Promise<void> {
    await this.app.vault.adapter.remove(`${this.dir}/${rel}`);
  }
}
