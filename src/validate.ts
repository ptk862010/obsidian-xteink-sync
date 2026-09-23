/** Kiểm giá trị cài đặt (thuần, không phụ thuộc Obsidian để unit test được). */
import { deviceSubdir } from "./sync";

/** Mã ngôn ngữ BCP 47 đơn giản (en, vi, pt-BR, zh-Hant-TW). Sai dạng → null. */
export function cleanLang(v: string): string | null {
  const s = v.trim();
  return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$/.test(s) ? s : null;
}

/** Thư mục trên máy: từng cấp slug hóa như thư mục vault (không có "..", ký tự lạ). */
export function cleanDeviceFolder(v: string): string {
  return deviceSubdir(v) || "Obsidian";
}
