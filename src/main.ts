import { Menu, Notice, Plugin, TAbstractFile, TFile, TFolder, requestUrl } from "obsidian";
import { CrossPointClient, HttpFn, findDevice } from "./device";
import { DEFAULT_SETTINGS, XteinkSettingTab, XteinkSettings } from "./settings";
import { Outbox } from "./outbox";
import { sendNotes, sendOutbox, syncNow } from "./actions";

export default class XteinkSyncPlugin extends Plugin {
  settings: XteinkSettings = DEFAULT_SETTINGS;
  outbox!: Outbox;
  private busy = false;

  readonly http: HttpFn = async (req) => {
    const res = await requestUrl({ url: req.url, method: req.method, headers: req.headers, body: req.body, throw: false });
    return { status: res.status, text: res.text };
  };

  async onload(): Promise<void> {
    await this.loadSettings();
    this.outbox = new Outbox(this.app, `${this.app.vault.configDir}/plugins/${this.manifest.id}/outbox`);
    this.addSettingTab(new XteinkSettingTab(this.app, this));

    this.addRibbonIcon("book-up", "Đồng bộ sang Xteink", () => this.run(() => syncNow(this)));
    this.addCommand({
      id: "send-current-note",
      name: "Gửi note đang mở sang Xteink",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) this.run(() => sendNotes(this, [file]));
        return true;
      },
    });
    this.addCommand({ id: "send-outbox", name: "Gửi hộp thư đang chờ sang Xteink", callback: () => this.run(() => sendOutbox(this)) });
    this.addCommand({ id: "sync", name: "Đồng bộ thư mục/tag sang Xteink", callback: () => this.run(() => syncNow(this)) });
    this.addCommand({ id: "check-device", name: "Kiểm tra kết nối Xteink", callback: () => this.checkDevice() });

    this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => this.addMenu(menu, [file])));
    this.registerEvent(this.app.workspace.on("files-menu", (menu, files) => this.addMenu(menu, files)));
  }

  private addMenu(menu: Menu, files: TAbstractFile[]): void {
    const notes = this.expandToNotes(files);
    if (!notes.length) return;
    menu.addItem((item) =>
      item
        .setTitle(notes.length === 1 ? "Gửi sang Xteink" : `Gửi ${notes.length} note sang Xteink`)
        .setIcon("book-up")
        .onClick(() => this.run(() => sendNotes(this, notes))),
    );
  }

  private expandToNotes(files: TAbstractFile[]): TFile[] {
    const out: TFile[] = [];
    const walk = (f: TAbstractFile) => {
      if (f instanceof TFile) {
        if (f.extension === "md") out.push(f);
      } else if (f instanceof TFolder) {
        f.children.forEach(walk);
      }
    };
    files.forEach(walk);
    return out;
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  get deviceDir(): string {
    return "/" + this.settings.deviceFolder;
  }

  renderOptions() {
    return { maxImageWidth: this.settings.maxImageWidth, imageQuality: this.settings.imageQuality, lang: this.settings.lang };
  }

  /** Tìm máy qua tên mDNS rồi IP nhớ lần trước; nhớ IP mới nếu thấy. */
  async connect(): Promise<CrossPointClient | null> {
    const found = await findDevice(this.http, [this.settings.host, this.settings.lastIp]);
    if (!found) return null;
    if (found.status.ip && found.status.ip !== this.settings.lastIp) {
      this.settings.lastIp = found.status.ip;
      await this.saveSettings();
    }
    return found.client;
  }

  async checkDevice(): Promise<void> {
    const client = await this.connect();
    if (!client) {
      const tried = [this.settings.host, this.settings.lastIp].filter(Boolean).join(" / ");
      new Notice(`Không thấy Xteink ở ${tried}. Máy phải đang ở File Transfer → Join Network.`, 8000);
      return;
    }
    const st = await client.status();
    new Notice(`Xteink ${st.device} firmware ${st.version} — ${st.ip} (${st.mode}). Sẵn sàng nhận file.`, 6000);
  }

  /** Mỗi lúc chỉ chạy một việc, lỗi thì báo Notice thay vì im lặng. */
  private async run(work: () => Promise<void>): Promise<void> {
    if (this.busy) {
      new Notice("Đang gửi dở, chờ xong đã.");
      return;
    }
    this.busy = true;
    try {
      await work();
    } catch (e) {
      console.error("[xteink-sync]", e);
      new Notice(`Xteink: ${(e as Error).message}`, 8000);
    } finally {
      this.busy = false;
    }
  }
}
