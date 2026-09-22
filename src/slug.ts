/** Tên file ASCII an toàn cho thẻ SD của máy đọc sách (bỏ dấu tiếng Việt, đ → d). */
export function asciiSlug(text: string, max = 60): string {
  const stripped = text
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  let slug = stripped.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (slug.length > max) slug = slug.slice(0, max).replace(/-+$/g, "");
  return slug || "note";
}

/** FNV-1a 32-bit → base36, đủ ngắn để chèn vào tên file khi trùng. */
export function shortHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, "0");
}
