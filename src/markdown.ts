/** Máy đọc sách không vẽ được mermaid/toán khối → giữ mã nguồn dạng code để còn đọc được. */
export function preprocessMarkdown(md: string): string {
  return md
    .replace(/```mermaid\n([\s\S]*?)```/g, (_m, src: string) => "*Sơ đồ (mermaid):*\n\n```text\n" + src + "```")
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => "\n```text\n" + tex.trim() + "\n```\n")
    .replace(/%%[\s\S]*?%%/g, "");
}

export function stripFrontmatter(raw: string, endOffset: number | undefined): string {
  if (endOffset) return raw.slice(endOffset).replace(/^\r?\n/, "");
  return raw.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}
