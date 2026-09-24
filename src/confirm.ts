import { App, Modal, Setting } from "obsidian";

/** Hộp hỏi Có/Không. Trả về true nếu người dùng bấm nút đồng ý. */
export function confirmDialog(app: App, title: string, body: string, okText: string, cancelText: string): Promise<boolean> {
  return new Promise((resolve) => {
    let answered = false;
    const modal = new (class extends Modal {
      onOpen(): void {
        this.setTitle(title);
        this.contentEl.createEl("p", { text: body });
        new Setting(this.contentEl)
          .addButton((b) =>
            b.setButtonText(cancelText).onClick(() => {
              answered = true;
              resolve(false);
              this.close();
            }),
          )
          .addButton((b) =>
            b
              .setButtonText(okText)
              .setCta()
              .onClick(() => {
                answered = true;
                resolve(true);
                this.close();
              }),
          );
      }

      onClose(): void {
        this.contentEl.empty();
        if (!answered) resolve(false);
      }
    })(app);
    modal.open();
  });
}
