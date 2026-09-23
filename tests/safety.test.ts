import { test } from "node:test";
import assert from "node:assert/strict";
import { CrossPointClient, DeviceError, assertSafeDevicePath } from "../src/device";
import { buildEpub, escapeXml } from "../src/epub";
import { buildMultipart } from "../src/multipart";
import { asciiSlug } from "../src/slug";
import { deviceSubdir } from "../src/sync";
import { cleanDeviceFolder, cleanLang } from "../src/validate";
import { strFromU8, unzipSync } from "fflate";

// Plugin dùng window.setTimeout (Obsidian); Node không có window
(globalThis as { window?: unknown }).window ??= globalThis;

test("slug không bao giờ ra '.', '..' hay có dấu /", () => {
  for (const s of ["..", ".", "../../etc", "a/b", "CON", "", "...", "/"]) {
    const out = asciiSlug(s);
    assert.ok(!out.includes("/") && out !== "." && out !== "..", `${s} → ${out}`);
  }
  assert.equal(deviceSubdir("../../x/./y"), "x/y");
});

test("thư mục trên máy trong cài đặt được làm sạch như thư mục vault", () => {
  assert.equal(cleanDeviceFolder("../Sách/Đọc"), "Sach/Doc");
  assert.equal(cleanDeviceFolder("/"), "Obsidian");
  assert.equal(cleanDeviceFolder(""), "Obsidian");
});

test("đường dẫn gửi xuống máy: chặn . .. và ký tự lạ", async () => {
  assert.equal(assertSafeDevicePath("/Obsidian/a.epub"), "/Obsidian/a.epub");
  for (const p of ["/Obsidian/../x", "Obsidian/a", "/a/./b", "/a\\b", "/a\nb"]) assert.throws(() => assertSafeDevicePath(p), DeviceError, p);
  let called = false;
  const client = new CrossPointClient(async () => ((called = true), { status: 200, text: "" }), "192.168.1.50");
  await assert.rejects(client.delete("/Obsidian/../important.epub"), DeviceError);
  await assert.rejects(client.upload("/Obsidian/..", "a.epub", new Uint8Array(1)), DeviceError);
  assert.equal(called, false);
});

test("multipart: tên file có ngoặc kép / xuống dòng không chèn được header", () => {
  const { body } = buildMultipart("file", 'a"\r\nContent-Type: evil\r\n.epub', new Uint8Array([1]));
  const text = new TextDecoder().decode(body);
  assert.ok(!text.includes("\r\nContent-Type: evil"));
  assert.match(text, /filename="a___Content-Type: evil__\.epub"/);
});

test("ngôn ngữ EPUB: chỉ nhận mã hợp lệ; escape khi ghi vào XML", async () => {
  assert.equal(cleanLang(" pt-BR "), "pt-BR");
  assert.equal(cleanLang("vi"), "vi");
  assert.equal(cleanLang('vi" onload="x'), null);
  assert.equal(cleanLang("<x>"), null);
  assert.equal(escapeXml('a"<b>&' + String.fromCharCode(1)), "a&quot;&lt;b&gt;&amp;");
  const bytes = await buildEpub({ title: "T", lang: 'x"y', bodyXhtml: "<p>a</p>", images: [], headings: [], identifier: "id", date: "2026-09-23T00:00:00.000Z" });
  const opf = strFromU8(unzipSync(bytes)["OEBPS/content.opf"]);
  assert.ok(opf.includes('xml:lang="x&quot;y"'));
});
