import { test } from "node:test";
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";
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
  const zip = unzipSync(bytes);
  assert.equal(Object.keys(zip)[0], "mimetype");
  for (const f of ["META-INF/container.xml", "OEBPS/content.opf", "OEBPS/nav.xhtml", "OEBPS/toc.ncx", "OEBPS/text.xhtml", "OEBPS/style.css", "OEBPS/images/img0.jpg"]) {
    assert.ok(zip[f], `thiếu ${f}`);
  }
  assert.deepEqual(Array.from(zip["OEBPS/images/img0.jpg"]), [0xff, 0xd8, 0xff]);
  const opf = strFromU8(zip["OEBPS/content.opf"]);
  assert.ok(opf.includes("<dc:title>Note &quot;thử&quot; &amp; test</dc:title>"));
  assert.ok(opf.includes('href="images/img0.jpg" media-type="image/jpeg"'));
  const nav = strFromU8(zip["OEBPS/nav.xhtml"]);
  assert.ok(nav.includes('href="text.xhtml#h1">Tiêu đề</a>'));
  const text = strFromU8(zip["OEBPS/text.xhtml"]);
  assert.ok(text.includes('xmlns="http://www.w3.org/1999/xhtml"'));
  assert.ok(text.includes("Xin chào <b>đậm</b>"));
});
