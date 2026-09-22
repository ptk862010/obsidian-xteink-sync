import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMultipart, formUrlEncoded } from "../src/multipart";

test("buildMultipart bọc đúng file và boundary", () => {
  const bytes = new TextEncoder().encode("PK\x03\x04abc");
  const { body, contentType } = buildMultipart("file", "note.epub", bytes, "application/epub+zip");
  const boundary = contentType.split("boundary=")[1];
  const text = new TextDecoder().decode(body);
  assert.ok(text.startsWith(`--${boundary}\r\n`));
  assert.ok(text.includes('Content-Disposition: form-data; name="file"; filename="note.epub"\r\n'));
  assert.ok(text.includes("Content-Type: application/epub+zip\r\n\r\nPK\x03\x04abc\r\n"));
  assert.ok(text.endsWith(`--${boundary}--\r\n`));
});

test("buildMultipart khử ký tự lạ trong tên file", () => {
  const { body } = buildMultipart("file", 'a"b\r\nc.epub', new Uint8Array(0));
  assert.ok(new TextDecoder().decode(body).includes('filename="a_b__c.epub"'));
});

test("formUrlEncoded mã hóa đường dẫn", () => {
  assert.equal(formUrlEncoded({ path: "/Obsidian/a b.epub", name: "x&y" }), "path=%2FObsidian%2Fa%20b.epub&name=x%26y");
});
