import { App, Component, MarkdownRenderer, TFile } from "obsidian";
import { EpubInput, buildEpub } from "./epub";
import { ImageContext, cleanDom, collectHeadings, resolveImages } from "./dom";
import { t } from "./i18n";
import { preprocessMarkdown, stripFrontmatter, stripInvalidXmlChars } from "./markdown";

export interface RenderOptions {
  maxImageWidth: number;
  imageQuality: number;
  lang: string;
  fetchRemoteImages: boolean;
}

function plainLinkText(s: string): string {
  return s.replace(/\[\[([^\]|#]*)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_m, target: string, alias?: string) => alias ?? target);
}

function frontmatterString(v: unknown): string | undefined {
  if (typeof v === "string") return plainLinkText(v);
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string").map(plainLinkText).join(", ") || undefined;
  return undefined;
}

async function waitForEmbeds(el: HTMLElement, ms: number): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (!el.querySelector(".internal-embed:not(.is-loaded)")) return;
    await new Promise((r) => window.setTimeout(r, 100));
  }
}

export async function noteToEpub(app: App, file: TFile, opts: RenderOptions): Promise<{ bytes: Uint8Array; title: string; author?: string }> {
  const cache = app.metadataCache.getFileCache(file);
  const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
  const title = frontmatterString(fm.title) || file.basename;
  const author = frontmatterString(fm.author);
  const source = frontmatterString(fm.source);

  const raw = await app.vault.cachedRead(file);
  let md = preprocessMarkdown(stripFrontmatter(raw, cache?.frontmatterPosition?.end.offset), t().mermaidLabel);
  if (source && /^https?:\/\//.test(source)) md = `*${t().sourceLabel}: [${source}](${source})*\n\n` + md;

  const component = new Component();
  component.load();
  const root = createDiv();
  try {
    await MarkdownRenderer.render(app, md, root, file.path, component);
    await waitForEmbeds(root, 3000);
    const ctx: ImageContext = { app, source: file, opts, images: [] };
    await resolveImages(ctx, root);
    cleanDom(root);
    const headings = collectHeadings(root);
    const input: EpubInput = {
      title,
      author,
      lang: opts.lang,
      // Ký tự điều khiển (dán từ PDF…) không hợp lệ trong XML → bỏ trước khi đóng gói
      bodyXhtml: stripInvalidXmlChars(new XMLSerializer().serializeToString(root)),
      images: ctx.images,
      headings,
      identifier: `urn:obsidian:${file.path}`,
      date: new Date(file.stat.mtime).toISOString(),
    };
    return { bytes: await buildEpub(input), title, author };
  } finally {
    component.unload();
  }
}
