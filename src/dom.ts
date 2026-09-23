import { App, TFile, requestUrl } from "obsidian";
import { EpubHeading, EpubImage } from "./epub";
import { t } from "./i18n";
import { shrinkImage } from "./image";

export interface ImageOptions {
  maxImageWidth: number;
  imageQuality: number;
  /** Tải ảnh là link http(s) trong note. Mặc định tắt: không tự gọi ra ngoài. */
  fetchRemoteImages: boolean;
}

export interface ImageContext {
  app: App;
  source: TFile;
  opts: ImageOptions;
  images: EpubImage[];
}

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"]);
const KEEP_ATTRS = new Set(["href", "src", "class", "id", "alt", "colspan", "rowspan", "start", "xmlns"]);
/** Phần giao diện của Obsidian (nút, icon…), không phải nội dung */
const REMOVE_SELECTOR = [
  ".edit-block-button", ".collapse-indicator", ".heading-collapse-indicator", ".list-collapse-indicator",
  ".copy-code-button", ".callout-fold", ".callout-icon", ".markdown-embed-link", ".frontmatter",
  ".mod-frontmatter", ".metadata-container", "button", "script", "style", "iframe", "video", "audio",
].join(",");
/** Ảnh remote tối đa (byte) */
const REMOTE_MAX_BYTES = 10 * 1024 * 1024;

async function embedImage(ctx: ImageContext, bytes: ArrayBuffer, mediaType: string): Promise<string | null> {
  const shrunk = await shrinkImage(new Uint8Array(bytes), mediaType, ctx.opts.maxImageWidth, ctx.opts.imageQuality);
  if (!shrunk) return null;
  const href = `images/img${ctx.images.length}.${shrunk.ext}`;
  ctx.images.push({ href, bytes: shrunk.bytes, mediaType: shrunk.mediaType });
  return href;
}

const withoutQuery = (url: string) => url.split(/[?#]/)[0];

/**
 * Ảnh markdown ![](đường/dẫn.png) được Obsidian vẽ thành <img src="app://…?mtime">. Dựng bảng
 * resource URL → file từ danh sách embed của chính note (không duyệt cả vault).
 */
function resourceMap(ctx: ImageContext): Map<string, TFile> {
  const map = new Map<string, TFile>();
  const embeds = ctx.app.metadataCache.getFileCache(ctx.source)?.embeds ?? [];
  for (const e of embeds) {
    const file = ctx.app.metadataCache.getFirstLinkpathDest(e.link.split(/[|#]/)[0], ctx.source.path);
    if (file && IMAGE_EXT.has(file.extension.toLowerCase())) map.set(withoutQuery(ctx.app.vault.getResourcePath(file)), file);
  }
  return map;
}

function mediaTypeFor(ext: string): string {
  const e = ext.toLowerCase();
  return `image/${e === "jpg" ? "jpeg" : e === "svg" ? "svg+xml" : e}`;
}

async function fetchRemote(ctx: ImageContext, src: string): Promise<string | null> {
  if (!ctx.opts.fetchRemoteImages || !/^https:\/\//i.test(src)) return null;
  const res = await requestUrl({ url: src, throw: false });
  if (res.status !== 200 || res.arrayBuffer.byteLength > REMOTE_MAX_BYTES) return null;
  const type = res.headers["content-type"] ?? "image/jpeg";
  if (!type.toLowerCase().startsWith("image/")) return null;
  return embedImage(ctx, res.arrayBuffer, type);
}

export async function resolveImages(ctx: ImageContext, root: HTMLElement): Promise<void> {
  const doc = root.ownerDocument;
  const L = t();
  // ![[ảnh.png]] → span.internal-embed[src] bọc img
  for (const embed of Array.from(root.querySelectorAll<HTMLElement>(".internal-embed[src]"))) {
    const src = (embed.getAttribute("src") ?? "").split(/[|#]/)[0].trim();
    const ext = src.split(".").pop() ?? "";
    if (!IMAGE_EXT.has(ext.toLowerCase())) continue;
    const file = ctx.app.metadataCache.getFirstLinkpathDest(src, ctx.source.path);
    const href = file ? await embedImage(ctx, await ctx.app.vault.readBinary(file), mediaTypeFor(ext)) : null;
    if (href) {
      const img = createEl("img");
      img.setAttribute("src", href);
      img.setAttribute("alt", src);
      embed.replaceWith(img);
    } else {
      embed.replaceWith(doc.createTextNode(L.imageAlt(src)));
    }
  }
  // ![](đường dẫn) hoặc ảnh ngoài
  let resources: Map<string, TFile> | null = null;
  for (const img of Array.from(root.querySelectorAll<HTMLImageElement>("img"))) {
    const src = img.getAttribute("src") ?? "";
    if (src.startsWith("images/")) continue;
    let href: string | null = null;
    try {
      if (/^https?:\/\//i.test(src)) {
        href = await fetchRemote(ctx, src);
      } else {
        resources ??= resourceMap(ctx);
        const file = resources.get(withoutQuery(src));
        if (file) href = await embedImage(ctx, await ctx.app.vault.readBinary(file), mediaTypeFor(file.extension));
      }
    } catch {
      href = null;
    }
    if (href) img.setAttribute("src", href);
    else img.replaceWith(doc.createTextNode(L.imageAlt(img.getAttribute("alt") || src.slice(0, 60))));
  }
}

/** Bỏ nút bấm, icon, link nội bộ… để ra XHTML sạch cho máy đọc sách. */
export function cleanDom(root: HTMLElement): void {
  const doc = root.ownerDocument;
  const L = t();
  root.querySelectorAll(REMOVE_SELECTOR).forEach((n) => n.remove());
  // Hình vẽ SVG nhúng thẳng (biểu đồ của plugin khác…): máy không vẽ được → để chú thích thay vì biến mất
  for (const svg of Array.from(root.querySelectorAll("svg"))) {
    if (svg.parentElement?.closest("svg")) continue;
    const box = createEl("p");
    box.textContent = L.drawingAlt;
    svg.replaceWith(box);
  }
  for (const embed of Array.from(root.querySelectorAll<HTMLElement>(".internal-embed"))) {
    const content = embed.querySelector(".markdown-embed-content");
    if (content) {
      const box = createEl("blockquote");
      box.append(...Array.from(content.childNodes));
      embed.replaceWith(box);
    } else {
      embed.replaceWith(doc.createTextNode(L.embedAlt(embed.getAttribute("src") ?? "")));
    }
  }
  for (const box of Array.from(root.querySelectorAll<HTMLInputElement>("input.task-list-item-checkbox"))) {
    const done = box.checked || box.hasAttribute("checked");
    box.closest("li")?.classList.toggle("task-done", done);
    box.replaceWith(doc.createTextNode(done ? "☑ " : "☐ "));
  }
  for (const a of Array.from(root.querySelectorAll<HTMLAnchorElement>("a"))) {
    const href = a.getAttribute("href") ?? "";
    // Giữ link web và link trong cùng trang (chú thích cuối trang #fn…); link nội bộ vault, tag → chữ thường
    const keep = !a.classList.contains("internal-link") && !a.classList.contains("tag") && (/^https?:\/\//.test(href) || /^#[\w:.-]+$/.test(href));
    if (!keep) {
      const span = createSpan();
      if (a.classList.contains("tag")) span.className = "tag";
      span.textContent = a.textContent;
      a.replaceWith(span);
    }
  }
  root.querySelectorAll("input, select, textarea").forEach((n) => n.remove());
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
    for (const attr of Array.from(el.attributes)) {
      if (!KEEP_ATTRS.has(attr.name)) el.removeAttribute(attr.name);
    }
    el.classList.remove("is-collapsed", "is-loaded");
    if (!el.className) el.removeAttribute("class");
  }
}

export function collectHeadings(root: HTMLElement): EpubHeading[] {
  const heads: EpubHeading[] = [];
  root.querySelectorAll<HTMLElement>("h1, h2, h3").forEach((h, i) => {
    h.id = `h${i + 1}`;
    heads.push({ id: h.id, level: Number(h.tagName[1]), text: h.textContent?.trim() || t().sectionN(i + 1) });
  });
  return heads;
}
