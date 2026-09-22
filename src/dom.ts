import { App, TFile, requestUrl } from "obsidian";
import { EpubHeading, EpubImage } from "./epub";
import { shrinkImage } from "./image";

export interface ImageOptions {
  maxImageWidth: number;
  imageQuality: number;
}

export interface ImageContext {
  app: App;
  sourcePath: string;
  opts: ImageOptions;
  images: EpubImage[];
}

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"]);
const KEEP_ATTRS = new Set(["href", "src", "class", "id", "alt", "colspan", "rowspan", "start", "xmlns"]);
const REMOVE_SELECTOR = [
  ".edit-block-button", ".collapse-indicator", ".heading-collapse-indicator", ".list-collapse-indicator",
  ".copy-code-button", ".callout-fold", ".callout-icon", ".markdown-embed-link", ".frontmatter",
  ".mod-frontmatter", ".metadata-container", "button", "svg", "script", "style", "iframe", "video", "audio",
].join(",");

async function embedImage(ctx: ImageContext, bytes: ArrayBuffer, mediaType: string): Promise<string | null> {
  const shrunk = await shrinkImage(new Uint8Array(bytes), mediaType, ctx.opts.maxImageWidth, ctx.opts.imageQuality);
  if (!shrunk) return null;
  const href = `images/img${ctx.images.length}.${shrunk.ext}`;
  ctx.images.push({ href, bytes: shrunk.bytes, mediaType: shrunk.mediaType });
  return href;
}

/** img src dạng app://… (ảnh theo đường dẫn vault) → tìm TFile có đường dẫn khớp đuôi. */
function vaultFileFromResourceUrl(app: App, src: string): TFile | null {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(src).pathname).replace(/\\/g, "/");
  } catch {
    return null;
  }
  return app.vault.getFiles().find((f) => IMAGE_EXT.has(f.extension.toLowerCase()) && pathname.endsWith("/" + f.path)) ?? null;
}

function mediaTypeFor(ext: string): string {
  const e = ext.toLowerCase();
  return `image/${e === "jpg" ? "jpeg" : e === "svg" ? "svg+xml" : e}`;
}

export async function resolveImages(ctx: ImageContext, root: HTMLElement): Promise<void> {
  const doc = root.ownerDocument;
  // ![[ảnh.png]] → span.internal-embed[src] bọc img
  for (const embed of Array.from(root.querySelectorAll<HTMLElement>(".internal-embed[src]"))) {
    const src = (embed.getAttribute("src") ?? "").split(/[|#]/)[0].trim();
    const ext = src.split(".").pop() ?? "";
    if (!IMAGE_EXT.has(ext.toLowerCase())) continue;
    const file = ctx.app.metadataCache.getFirstLinkpathDest(src, ctx.sourcePath);
    const href = file ? await embedImage(ctx, await ctx.app.vault.readBinary(file), mediaTypeFor(ext)) : null;
    if (href) {
      const img = doc.createElement("img");
      img.setAttribute("src", href);
      img.setAttribute("alt", src);
      embed.replaceWith(img);
    } else {
      embed.replaceWith(doc.createTextNode(`(ảnh: ${src})`));
    }
  }
  // ![](đường dẫn) hoặc ảnh ngoài
  for (const img of Array.from(root.querySelectorAll<HTMLImageElement>("img"))) {
    const src = img.getAttribute("src") ?? "";
    if (src.startsWith("images/")) continue;
    let href: string | null = null;
    try {
      if (/^https?:\/\//.test(src)) {
        const res = await requestUrl({ url: src, throw: false });
        if (res.status === 200) href = await embedImage(ctx, res.arrayBuffer, res.headers["content-type"] ?? "image/jpeg");
      } else {
        const file = vaultFileFromResourceUrl(ctx.app, src);
        if (file) href = await embedImage(ctx, await ctx.app.vault.readBinary(file), mediaTypeFor(file.extension));
      }
    } catch {
      href = null;
    }
    if (href) img.setAttribute("src", href);
    else img.replaceWith(doc.createTextNode(`(ảnh: ${img.getAttribute("alt") || src.slice(0, 60)})`));
  }
}

/** Bỏ nút bấm, icon, link nội bộ… để ra XHTML sạch cho máy đọc sách. */
export function cleanDom(root: HTMLElement): void {
  const doc = root.ownerDocument;
  root.querySelectorAll(REMOVE_SELECTOR).forEach((n) => n.remove());
  for (const embed of Array.from(root.querySelectorAll<HTMLElement>(".internal-embed"))) {
    const content = embed.querySelector(".markdown-embed-content");
    if (content) {
      const box = doc.createElement("blockquote");
      box.append(...Array.from(content.childNodes));
      embed.replaceWith(box);
    } else {
      embed.replaceWith(doc.createTextNode(`(nhúng: ${embed.getAttribute("src") ?? ""})`));
    }
  }
  for (const box of Array.from(root.querySelectorAll<HTMLInputElement>("input.task-list-item-checkbox"))) {
    const done = box.checked || box.hasAttribute("checked");
    box.closest("li")?.classList.toggle("task-done", done);
    box.replaceWith(doc.createTextNode(done ? "☑ " : "☐ "));
  }
  for (const a of Array.from(root.querySelectorAll<HTMLAnchorElement>("a"))) {
    const href = a.getAttribute("href") ?? "";
    if (a.classList.contains("internal-link") || a.classList.contains("tag") || !/^https?:\/\//.test(href)) {
      const span = doc.createElement("span");
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
    heads.push({ id: h.id, level: Number(h.tagName[1]), text: h.textContent?.trim() || `Mục ${i + 1}` });
  });
  return heads;
}
