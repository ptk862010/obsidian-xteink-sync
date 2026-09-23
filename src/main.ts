import { Menu, Notice, Plugin, TAbstractFile, TFile, TFolder, getLanguage, requestUrl } from "obsidian";
import { CrossPointClient, HttpFn, findDevice } from "./device";
import { DEFAULT_SETTINGS, XteinkSettingTab, XteinkSettings, cleanDeviceFolder, cleanLang } from "./settings";
import { Outbox } from "./outbox";
import { sendNotes, sendOutbox, syncNow } from "./actions";
import { setLanguage, t } from "./i18n";
import { ShelfClient } from "./shelf";

/** Chờ file thôi thay đổi ngần này rồi mới tự gửi. */
const AUTO_DELAY_MS = 4000;

export default class XteinkSyncPlugin extends Plugin {
  settings: XteinkSettings = DEFAULT_SETTINGS;
  outbox!: Outbox;
  private busy = false;
  /** note mới đang chờ tự gửi: đường dẫn → hẹn giờ (gửi sau khi file thôi thay đổi vài giây) */
  private readonly autoPending = new Map<string, number>();

  readonly http: HttpFn = async (req) => {
    const res = await requestUrl({ url: req.url, method: req.method, headers: req.headers, body: req.body, throw: false });
    return { status: res.status, text: res.text };
  };

  async onload(): Promise<void> {
    setLanguage(getLanguage());
    await this.loadSettings();
    const L = t();
    this.outbox = new Outbox(this.app, `${this.app.vault.configDir}/plugins/${this.manifest.id}/outbox`);
    this.addSettingTab(new XteinkSettingTab(this.app, this));

    this.addRibbonIcon("book-up", L.ribbonSync, () => this.run(() => syncNow(this)));
    this.addCommand({
      id: "send-current-note",
      name: L.cmdSendNote,
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) void this.run(() => sendNotes(this, [file]));
        return true;
      },
    });
    this.addCommand({ id: "send-outbox", name: L.cmdSendOutbox, callback: () => this.run(() => sendOutbox(this)) });
    this.addCommand({ id: "sync", name: L.cmdSync, callback: () => this.run(() => syncNow(this)) });
    this.addCommand({ id: "check-device", name: L.cmdCheck, callback: () => this.checkConnection() });

    // Chỉ theo dõi sau khi vault nạp xong: lúc khởi động Obsidian bắn "create" cho mọi file sẵn có
    this.app.workspace.onLayoutReady(() => {
      this.registerEvent(this.app.vault.on("create", (f) => this.watchNew(f)));
      this.registerEvent(this.app.vault.on("modify", (f) => this.bumpPending(f.path)));
      this.registerEvent(this.app.vault.on("rename", (f, old) => this.renamePending(f, old)));
    });
    this.register(() => {
      for (const timer of this.autoPending.values()) window.clearTimeout(timer);
      this.autoPending.clear();
    });

    this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => this.addMenu(menu, [file])));
    this.registerEvent(this.app.workspace.on("files-menu", (menu, files) => this.addMenu(menu, files)));
  }

  private addMenu(menu: Menu, files: TAbstractFile[]): void {
    const notes = this.expandToNotes(files);
    if (!notes.length) return;
    const L = t();
    menu.addItem((item) =>
      item
        .setTitle(notes.length === 1 ? L.menuSendOne : L.menuSendMany(notes.length))
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

  private inAutoFolder(f: TAbstractFile): f is TFile {
    const dir = this.settings.autoSendFolder;
    return f instanceof TFile && f.extension === "md" && !!dir && f.path.startsWith(dir + "/");
  }

  private watchNew(f: TAbstractFile): void {
    if (!this.settings.autoSend || !this.inAutoFolder(f)) return;
    this.bumpPending(f.path, true);
  }

  /** Hẹn gửi AUTO_DELAY_MS sau lần ghi cuối (Web Clipper tạo file rồi có thể ghi thêm). */
  private bumpPending(path: string, start = false): void {
    if (!start && !this.autoPending.has(path)) return;
    const old = this.autoPending.get(path);
    if (old !== undefined) window.clearTimeout(old);
    this.autoPending.set(path, window.setTimeout(() => void this.flushAuto(path), AUTO_DELAY_MS));
  }

  private renamePending(f: TAbstractFile, oldPath: string): void {
    const timer = this.autoPending.get(oldPath);
    if (timer === undefined) return;
    window.clearTimeout(timer);
    this.autoPending.delete(oldPath);
    if (this.inAutoFolder(f)) this.bumpPending(f.path, true);
  }

  private async flushAuto(path: string): Promise<void> {
    if (this.busy) {
      // Đang gửi việc khác: thử lại sau
      this.autoPending.set(path, window.setTimeout(() => void this.flushAuto(path), AUTO_DELAY_MS));
      return;
    }
    this.autoPending.delete(path);
    const file = this.app.vault.getFileByPath(path);
    if (!file || !this.settings.autoSend) return;
    // Đã gửi rồi (vd thiết bị khác cũng tự gửi, lịch sử đồng bộ theo vault) thì thôi
    if (this.settings.target === "shelf" && this.settings.shelfState[path]) return;
    await this.run(() => sendNotes(this, [file]));
  }

  async loadSettings(): Promise<void> {
    const saved = ((await this.loadData()) ?? {}) as Partial<XteinkSettings>;
    // Bản sao mới của giá trị mặc định: các lần nạp không dùng chung object syncState/shelfState
    const defaults: XteinkSettings = { ...DEFAULT_SETTINGS, syncFolders: [], syncState: {}, shelfState: {}, lang: cleanLang(getLanguage()) ?? "en" };
    this.settings = { ...defaults, ...saved };
    this.settings.lang = cleanLang(this.settings.lang) ?? defaults.lang;
    this.settings.deviceFolder = cleanDeviceFolder(this.settings.deviceFolder);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  get deviceDir(): string {
    return "/" + this.settings.deviceFolder;
  }

  renderOptions() {
    const s = this.settings;
    return { maxImageWidth: s.maxImageWidth, imageQuality: s.imageQuality, lang: s.lang, fetchRemoteImages: s.fetchRemoteImages };
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

  /** Kệ Xteink Lover; chưa có mã hợp lệ thì báo và trả null. */
  shelf(): ShelfClient | null {
    try {
      return new ShelfClient(this.http, this.settings.shelfUrl, this.settings.shelfToken);
    } catch {
      new Notice(t().shelfNoToken, 8000);
      return null;
    }
  }

  async checkConnection(): Promise<void> {
    const L = t();
    if (this.settings.target === "shelf") {
      const shelf = this.shelf();
      if (!shelf) return;
      await this.run(async () => {
        const me = await shelf.me();
        new Notice(L.shelfReady(me.user.username, me.usage.books, me.limits.maxBooks), 6000);
      });
      return;
    }
    const client = await this.connect();
    if (!client) {
      const tried = [this.settings.host, this.settings.lastIp].filter(Boolean).join(" / ");
      new Notice(L.deviceNotFoundAt(tried), 8000);
      return;
    }
    const st = await client.status();
    new Notice(L.deviceReady(st.device, st.version, st.ip, st.mode), 6000);
  }

  /** Mỗi lúc chỉ chạy một việc, lỗi thì báo Notice thay vì im lặng. */
  private async run(work: () => Promise<void>): Promise<void> {
    if (this.busy) {
      new Notice(t().busy);
      return;
    }
    this.busy = true;
    try {
      await work();
    } catch (e) {
      console.error("[xteink-sync]", e);
      new Notice(t().errorPrefix + (e as Error).message, 8000);
    } finally {
      this.busy = false;
    }
  }
}
