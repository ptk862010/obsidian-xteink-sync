import { test } from "node:test";
import assert from "node:assert/strict";
import { preprocessMarkdown, stripFrontmatter, stripInvalidXmlChars } from "../src/markdown";

test("preprocessMarkdown: mermaid và toán khối thành code, bỏ comment %%", () => {
  const md = "a\n\n```mermaid\nflowchart TD\nA-->B\n```\n\n$$x^2$$\n\n%% ẩn %%\nb";
  const out = preprocessMarkdown(md, "*Sơ đồ (mermaid):*");
  assert.ok(out.includes("*Sơ đồ (mermaid):*\n\n```text\nflowchart TD\nA-->B\n```"));
  assert.ok(out.includes("```text\nx^2\n```"));
  assert.ok(!out.includes("ẩn"));
  assert.ok(out.includes("b"));
});

test("stripFrontmatter dùng offset khi có, regex khi không", () => {
  const raw = "---\ntitle: X\n---\nnội dung";
  assert.equal(stripFrontmatter(raw, 16), "nội dung");
  assert.equal(stripFrontmatter(raw, undefined), "nội dung");
  assert.equal(stripFrontmatter("không có", undefined), "không có");
});

test("toán inline thành code; tiền $5 và $10 giữ nguyên; không đụng vào code", () => {
  assert.equal(preprocessMarkdown("Ta có $x^2 + 1$ nhé"), "Ta có `x^2 + 1` nhé");
  assert.equal(preprocessMarkdown("$a$ đầu dòng"), "`a` đầu dòng");
  assert.equal(preprocessMarkdown("Giá $5 và $10"), "Giá $5 và $10");
  const code = "dùng `$HOME/$PATH` và\n```sh\necho $a $b$\n```";
  assert.equal(preprocessMarkdown(code), code);
  const escaped = "giá \\$x$ thôi";
  assert.equal(preprocessMarkdown(escaped), escaped);
});

test("bỏ ký tự điều khiển không hợp lệ trong XML, giữ tab và xuống dòng", () => {
  const s = "a" + String.fromCharCode(0) + "b" + String.fromCharCode(0x1b) + "c\td\ne";
  assert.equal(stripInvalidXmlChars(s), "abc\td\ne");
});
