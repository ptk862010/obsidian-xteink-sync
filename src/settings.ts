import { App, PluginSettingTab, Setting } from "obsidian";
import type XteinkSyncPlugin from "./main";
import type { SyncState } from "./sync";

export interface XteinkSettings {
  host: string;
  lastIp: string;
  deviceFolder: string;
  syncFolders: string[];
  syncTag: string;
  deleteRemoved: boolean;
  mirrorFolders: boolean;
  maxImageWidth: number;
  imageQuality: number;
  lang: string;
  syncState: SyncState;
}

export const DEFAULT_SETTINGS: XteinkSettings = {
  host: "crosspoint.local",
  lastIp: "",
  deviceFolder: "Obsidian",
  syncFolders: [],
  syncTag: "xteink",
  deleteRemoved: false,
  mirrorFolders: false,
  maxImageWidth: 800,
  imageQuality: 0.8,
  lang: "vi",
  syncState: {},
};

export class XteinkSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: XteinkSyncPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;
    const save = () => this.plugin.saveSettings();

    new Setting(containerEl).setName("Máy đọc sách").setHeading();
    new Setting(containerEl)
      .setName("Địa chỉ máy")
      .setDesc("Tên mDNS hoặc IP. Máy phải đang ở màn hình File Transfer → Join Network. IP lần cuối tìm thấy: " + (s.lastIp || "chưa có"))
      .addText((t) => t.setValue(s.host).onChange(async (v) => { s.host = v.trim(); await save(); }));
    new Setting(containerEl)
      .setName("Thư mục trên máy")
      .setDesc("Thư mục trên thẻ SD để chứa EPUB từ Obsidian.")
      .addText((t) => t.setValue(s.deviceFolder).onChange(async (v) => { s.deviceFolder = v.trim().replace(/^\/+|\/+$/g, "") || "Obsidian"; await save(); }));
    new Setting(containerEl)
      .setName("Giữ cây thư mục của vault")
      .setDesc("Bật: note ở '03 - Resources/Books' lên máy thành /Obsidian/03-Resources/Books/. Tắt: đổ phẳng vào một thư mục. Máy sắp xếp thư mục trước, rồi tên.")
      .addToggle((t) => t.setValue(s.mirrorFolders).onChange(async (v) => { s.mirrorFolders = v; await save(); }));
    new Setting(containerEl)
      .setName("Kiểm tra kết nối")
      .addButton((b) => b.setButtonText("Thử ngay").onClick(() => this.plugin.checkDevice()));

    new Setting(containerEl).setName("Đồng bộ bấm-một-cái").setHeading();
    new Setting(containerEl)
      .setName("Thư mục cần đồng bộ")
      .setDesc("Mỗi dòng một thư mục trong vault (vd 03 - Resources/Books & Reading). Để trống nếu chỉ dùng tag.")
      .addTextArea((t) => {
        t.setValue(s.syncFolders.join("\n")).onChange(async (v) => {
          s.syncFolders = v.split("\n").map((x) => x.trim().replace(/^\/+|\/+$/g, "")).filter(Boolean);
          await save();
        });
        t.inputEl.rows = 4;
        t.inputEl.cols = 40;
      });
    new Setting(containerEl)
      .setName("Tag cần đồng bộ")
      .setDesc("Note có tag này (không cần dấu #) cũng được đồng bộ, dù nằm ở đâu.")
      .addText((t) => t.setValue(s.syncTag).onChange(async (v) => { s.syncTag = v.trim().replace(/^#/, ""); await save(); }));
    new Setting(containerEl)
      .setName("Xóa trên máy khi note ra khỏi phạm vi")
      .setDesc("Tắt thì file cũ cứ nằm lại trên máy. Chỉ xóa file plugin đã gửi.")
      .addToggle((t) => t.setValue(s.deleteRemoved).onChange(async (v) => { s.deleteRemoved = v; await save(); }));
    new Setting(containerEl)
      .setName("Quên lịch sử đồng bộ")
      .setDesc(`Đang nhớ ${Object.keys(s.syncState).length} note. Quên đi thì lần sau gửi lại toàn bộ.`)
      .addButton((b) => b.setButtonText("Quên").setWarning().onClick(async () => { s.syncState = {}; await save(); this.display(); }));

    new Setting(containerEl).setName("EPUB").setHeading();
    new Setting(containerEl)
      .setName("Chiều rộng ảnh tối đa (px)")
      .setDesc("Ảnh to hơn sẽ được thu nhỏ cho màn e-ink. X4 rộng 480px.")
      .addText((t) => t.setValue(String(s.maxImageWidth)).onChange(async (v) => { s.maxImageWidth = Math.max(100, Number(v) || 800); await save(); }));
    new Setting(containerEl)
      .setName("Ngôn ngữ EPUB")
      .addText((t) => t.setValue(s.lang).onChange(async (v) => { s.lang = v.trim() || "vi"; await save(); }));
  }
}
