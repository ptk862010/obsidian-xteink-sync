import { test } from "node:test";
import assert from "node:assert/strict";
import { asciiSlug, shortHash } from "../src/slug";

test("asciiSlug bỏ dấu tiếng Việt và đ", () => {
  assert.equal(asciiSlug("Kiến Trúc Micro-SaaS 0 Đồng (Free-Tier)"), "Kien-Truc-Micro-SaaS-0-Dong-Free-Tier");
  assert.equal(asciiSlug("Đường dây 500kV"), "Duong-day-500kV");
});

test("asciiSlug cắt độ dài và không để trống", () => {
  assert.equal(asciiSlug("!!!"), "note");
  assert.ok(asciiSlug("a".repeat(100)).length <= 60);
});

test("shortHash ổn định và khác nhau theo đường dẫn", () => {
  assert.equal(shortHash("a/b.md"), shortHash("a/b.md"));
  assert.notEqual(shortHash("a/b.md"), shortHash("a/c.md"));
  assert.equal(shortHash("x").length, 7);
});
