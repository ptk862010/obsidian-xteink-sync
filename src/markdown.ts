/** Khối code (``` / ~~~) và code inline: không đụng vào nội dung bên trong. */
const CODE = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`)/;

/** Chỉ biến đổi phần ngoài code. */
function outsideCode(md: string, fn: (text: string) => string): string {
  return md
    .split(CODE)
    .map((part, i) => (i % 2 === 1 ? part : fn(part)))
    .join("");
}

/**
 * Máy đọc sách không vẽ được mermaid và công thức toán → giữ mã nguồn dạng code để còn đọc được.
 * Toán inline $x^2$ theo luật của Obsidian: không có khoảng trắng ngay sau $ mở và ngay trước $ đóng,
 * nên "$5 và $10" không bị coi là công thức.
 */
export function preprocessMarkdown(md: string, mermaidLabel = "*Diagram (mermaid):*"): string {
  const withDiagrams = md.replace(/```mermaid\r?\n([\s\S]*?)```/g, (_m, src: string) => `${mermaidLabel}\n\n\`\`\`text\n${src}\`\`\``);
  return outsideCode(withDiagrams, (text) =>
    text
      .replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => "\n```text\n" + tex.trim() + "\n```\n")
      .replace(/(^|[^\\$])\$(?=\S)([^$\n]*?\S)\$(?!\d)/g, (_m, before: string, tex: string) => `${before}\`${tex.replace(/`/g, "'")}\``)
      .replace(/%%[\s\S]*?%%/g, ""),
  );
}

export function stripFrontmatter(raw: string, endOffset: number | undefined): string {
  if (endOffset) return raw.slice(endOffset).replace(/^\r?\n/, "");
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

/** Ký tự điều khiển C0 (trừ tab, xuống dòng) không hợp lệ trong XML 1.0. */
export function stripInvalidXmlChars(s: string): string {
  let bad = false;
  for (let i = 0; i < s.length && !bad; i++) {
    const c = s.charCodeAt(i);
    bad = c < 32 && c !== 9 && c !== 10 && c !== 13;
  }
  if (!bad) return s;
  return Array.from(s)
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return c >= 32 || c === 9 || c === 10 || c === 13;
    })
    .join("");
}
