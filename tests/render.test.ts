import { test } from "node:test";
import assert from "node:assert/strict";
import { preprocessMarkdown, stripFrontmatter } from "../src/markdown";

test("preprocessMarkdown: mermaid và toán khối thành code, bỏ comment %%", () => {
  const md = "a\n\n```mermaid\nflowchart TD\nA-->B\n```\n\n$$x^2$$\n\n%% ẩn %%\nb";
  const out = preprocessMarkdown(md);
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
