import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { buildEpub, escapeXml, EpubInput } from "../src/epub";

const input: EpubInput = {
  title: 'Note "thử" & test',
  author: "Kiên",
  lang: "vi",
  bodyXhtml: '<h1 id="h1">Tiêu đề</h1><p>Xin chào <b>đậm</b></p><img src="images/img0.jpg"/>',
  images: [{ href: "images/img0.jpg", bytes: new Uint8Array([0xff, 0xd8, 0xff]), mediaType: "image/jpeg" }],
  headings: [{ id: "h1", level: 1, text: "Tiêu đề" }],
  identifier: "urn:uuid:test",
  date: "2026-09-22T00:00:00Z",
};

test("escapeXml", () => {
  assert.equal(escapeXml('a<b>&"c"'), "a&lt;b&gt;&amp;&quot;c&quot;");
});

test("buildEpub: mimetype đầu tiên, không nén, đủ file bắt buộc", async () => {
  const bytes = await buildEpub(input);
  assert.equal(new TextDecoder().decode(bytes.slice(30, 38)), "mimetype");
  assert.equal(bytes[8] | (bytes[9] << 8), 0, "mimetype phải STORE (method 0)");
  const zip = await JSZip.loadAsync(bytes);
  for (const f of ["META-INF/container.xml", "OEBPS/content.opf", "OEBPS/nav.xhtml", "OEBPS/toc.ncx", "OEBPS/text.xhtml", "OEBPS/style.css", "OEBPS/images/img0.jpg"]) {
    assert.ok(zip.file(f), `thiếu ${f}`);
  }
  const opf = await zip.file("OEBPS/content.opf")!.async("string");
  assert.ok(opf.includes("<dc:title>Note &quot;thử&quot; &amp; test</dc:title>"));
  assert.ok(opf.includes('href="images/img0.jpg" media-type="image/jpeg"'));
  const nav = await zip.file("OEBPS/nav.xhtml")!.async("string");
  assert.ok(nav.includes('href="text.xhtml#h1">Tiêu đề</a>'));
  const text = await zip.file("OEBPS/text.xhtml")!.async("string");
  assert.ok(text.includes('xmlns="http://www.w3.org/1999/xhtml"'));
  assert.ok(text.includes("Xin chào <b>đậm</b>"));
});
