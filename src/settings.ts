import { App, PluginSettingTab, Setting } from "obsidian";
import { t } from "./i18n";
import { connectReader } from "./actions";
import type XteinkSyncPlugin from "./main";
import type { ShelfState } from "./shelf";
import { cleanDeviceFolder, cleanLang } from "./validate";
import type { SyncState } from "./sync";

export { cleanDeviceFolder, cleanLang };

export type Target = "device" | "shelf";

export interface XteinkSettings {
  target: Target;
  host: string;
  lastIp: string;
  deviceFolder: string;
  shelfUrl: string;
  shelfToken: string;
  syncFolders: string[];
  syncTag: string;
  deleteRemoved: boolean;
  mirrorFolders: boolean;
  maxImageWidth: number;
  imageQuality: number;
  fetchRemoteImages: boolean;
  autoSend: boolean;
  autoSendFolder: string;
  lang: string;
  syncState: SyncState;
  shelfState: ShelfState;
}

export const DEFAULT_SETTINGS: XteinkSettings = {
  target: "device",
  host: "crosspoint.local",
  lastIp: "",
  deviceFolder: "Obsidian",
  shelfUrl: "https://app.xteinklover.workers.dev",
  shelfToken: "",
  syncFolders: [],
  syncTag: "xteink",
  deleteRemoved: false,
  mirrorFolders: false,
  maxImageWidth: 800,
  imageQuality: 0.8,
  fetchRemoteImages: false,
  autoSend: false,
  autoSendFolder: "Clippings",
  lang: "en",
  syncState: {},
  shelfState: {},
};

export class XteinkSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: XteinkSyncPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;
    const L = t();
    const save = () => this.plugin.saveSettings();

    new Setting(containerEl).setName(L.hTarget).setHeading();
    new Setting(containerEl)
      .setName(L.target)
      .setDesc(L.targetDesc)
      .addDropdown((d) =>
        d
          .addOption("device", L.targetDevice)
          .addOption("shelf", L.targetShelf)
          .setValue(s.target)
          .onChange(async (v) => {
            s.target = v === "shelf" ? "shelf" : "device";
            await save();
            this.display();
          }),
      );

    if (s.target === "shelf") {
      new Setting(containerEl).setName(L.hShelf).setHeading();
      new Setting(containerEl)
        .setName(L.shelfUrl)
        .setDesc(L.shelfUrlDesc)
        .addText((x) => x.setValue(s.shelfUrl).onChange(async (v) => { s.shelfUrl = v.trim(); await save(); }));
      new Setting(containerEl)
        .setName(L.shelfToken)
        .setDesc(L.shelfTokenDesc)
        .addText((x) => {
          x.inputEl.type = "password";
          x.setValue(s.shelfToken).onChange(async (v) => { s.shelfToken = v.trim(); await save(); });
        });
      new Setting(containerEl)
        .setName(L.host)
        .setDesc(L.hostDesc(s.lastIp))
        .addText((x) => x.setValue(s.host).onChange(async (v) => { s.host = v.trim(); await save(); }));
      new Setting(containerEl)
        .setName(L.connectBtn)
        .setDesc(L.connectDesc)
        .addButton((b) => b.setButtonText(L.connectBtn).onClick(() => this.plugin.run(() => connectReader(this.plugin))));
    } else {
      new Setting(containerEl).setName(L.hDevice).setHeading();
      new Setting(containerEl)
        .setName(L.host)
        .setDesc(L.hostDesc(s.lastIp))
        .addText((x) => x.setValue(s.host).onChange(async (v) => { s.host = v.trim(); await save(); }));
      new Setting(containerEl)
        .setName(L.deviceFolder)
        .setDesc(L.deviceFolderDesc)
        .addText((x) => x.setValue(s.deviceFolder).onChange(async (v) => { s.deviceFolder = cleanDeviceFolder(v); await save(); }));
      new Setting(containerEl)
        .setName(L.mirror)
        .setDesc(L.mirrorDesc)
        .addToggle((x) => x.setValue(s.mirrorFolders).onChange(async (v) => { s.mirrorFolders = v; await save(); }));
    }
    new Setting(containerEl).setName(L.check).addButton((b) => b.setButtonText(L.checkBtn).onClick(() => this.plugin.checkConnection()));

    new Setting(containerEl).setName(L.hAuto).setHeading();
    new Setting(containerEl)
      .setName(L.autoSend)
      .setDesc(L.autoSendDesc)
      .addToggle((x) => x.setValue(s.autoSend).onChange(async (v) => { s.autoSend = v; await save(); }));
    new Setting(containerEl)
      .setName(L.autoFolder)
      .setDesc(L.autoFolderDesc)
      .addText((x) => x.setValue(s.autoSendFolder).onChange(async (v) => { s.autoSendFolder = v.trim().replace(/^\/+|\/+$/g, ""); await save(); }));

    new Setting(containerEl).setName(L.hSync).setHeading();
    new Setting(containerEl)
      .setName(L.folders)
      .setDesc(L.foldersDesc)
      .addTextArea((x) => {
        x.setValue(s.syncFolders.join("\n")).onChange(async (v) => {
          s.syncFolders = v.split("\n").map((f) => f.trim().replace(/^\/+|\/+$/g, "")).filter(Boolean);
          await save();
        });
        x.inputEl.rows = 4;
        x.inputEl.cols = 40;
      });
    new Setting(containerEl)
      .setName(L.tag)
      .setDesc(L.tagDesc)
      .addText((x) => x.setValue(s.syncTag).onChange(async (v) => { s.syncTag = v.trim().replace(/^#/, ""); await save(); }));
    new Setting(containerEl)
      .setName(L.deleteRemoved)
      .setDesc(L.deleteRemovedDesc)
      .addToggle((x) => x.setValue(s.deleteRemoved).onChange(async (v) => { s.deleteRemoved = v; await save(); }));
    const remembered = Object.keys(s.target === "shelf" ? s.shelfState : s.syncState).length;
    new Setting(containerEl)
      .setName(L.forget)
      .setDesc(L.forgetDesc(remembered))
      .addButton((b) =>
        b.setButtonText(L.forgetBtn).setWarning().onClick(async () => {
          if (s.target === "shelf") s.shelfState = {};
          else s.syncState = {};
          await save();
          this.display();
        }),
      );

    new Setting(containerEl).setName(L.hEpub).setHeading();
    new Setting(containerEl)
      .setName(L.maxWidth)
      .setDesc(L.maxWidthDesc)
      .addText((x) => x.setValue(String(s.maxImageWidth)).onChange(async (v) => { s.maxImageWidth = Math.min(2000, Math.max(100, Number(v) || 800)); await save(); }));
    new Setting(containerEl)
      .setName(L.remote)
      .setDesc(L.remoteDesc)
      .addToggle((x) => x.setValue(s.fetchRemoteImages).onChange(async (v) => { s.fetchRemoteImages = v; await save(); }));
    new Setting(containerEl)
      .setName(L.lang)
      .setDesc(L.langDesc)
      .addText((x) =>
        x.setValue(s.lang).onChange(async (v) => {
          const ok = cleanLang(v);
          if (ok) {
            s.lang = ok;
            await save();
          }
        }),
      );
  }
}
