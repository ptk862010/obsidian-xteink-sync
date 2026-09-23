import { test } from "node:test";
import assert from "node:assert/strict";
import type { HttpRequest } from "../src/device";
import { ShelfClient, ShelfError, normalizeShelfUrl, planShelf } from "../src/shelf";

const TOKEN = "xlapp_" + "a".repeat(64);

function fakeHttp(respond: (req: HttpRequest) => { status: number; body?: unknown }) {
  const calls: HttpRequest[] = [];
  const http = async (req: HttpRequest) => {
    calls.push(req);
    const r = respond(req);
    return { status: r.status, text: r.body === undefined ? "" : JSON.stringify(r.body) };
  };
  return { http, calls };
}

test("địa chỉ kệ: thêm https, bỏ đường dẫn; chỉ cho http với máy local", () => {
  assert.equal(normalizeShelfUrl("app.xteinklover.workers.dev/"), "https://app.xteinklover.workers.dev");
  assert.equal(normalizeShelfUrl("https://a.example/some/path"), "https://a.example");
  assert.equal(normalizeShelfUrl("http://localhost:8787"), "http://localhost:8787");
  assert.equal(normalizeShelfUrl("http://evil.example"), null);
  assert.equal(normalizeShelfUrl("ftp://x"), null);
  assert.equal(normalizeShelfUrl(""), null);
});

test("ShelfClient từ chối mã sai dạng trước khi gọi mạng", () => {
  const { http, calls } = fakeHttp(() => ({ status: 200 }));
  assert.throws(() => new ShelfClient(http, "https://a.example", "abc"), ShelfError);
  assert.throws(() => new ShelfClient(http, "http://evil.example", TOKEN), ShelfError);
  assert.equal(calls.length, 0);
});

test("upload gửi Bearer + EPUB thô, trả id; lỗi server thành ShelfError có thông báo", async () => {
  const { http, calls } = fakeHttp((req) =>
    req.url.includes("fail") ? { status: 507, body: { error: "Kệ đầy" } } : { status: 201, body: { book: { id: "abc123def" } } },
  );
  const shelf = new ShelfClient(http, "https://a.example", TOKEN);
  const bytes = new Uint8Array([0x50, 0x4b, 3, 4, 9]);
  assert.equal(await shelf.upload("Sổ tay: A&B", "Kiên", bytes), "abc123def");
  const c = calls[0];
  assert.equal(c.method, "POST");
  assert.equal(c.url, "https://a.example/api/books?title=S%E1%BB%95%20tay%3A%20A%26B&author=Ki%C3%AAn");
  assert.equal(c.headers?.Authorization, "Bearer " + TOKEN);
  assert.equal(c.headers?.["Content-Type"], "application/epub+zip");
  assert.deepEqual(new Uint8Array(c.body as ArrayBuffer), bytes);
  // Mảng con (byteOffset ≠ 0) chỉ gửi đúng phần của nó
  const big = new Uint8Array([1, 2, 3, 4, 5, 6]);
  await shelf.upload("x", undefined, big.subarray(2, 4));
  assert.deepEqual(new Uint8Array(calls[1].body as ArrayBuffer), new Uint8Array([3, 4]));

  const failing = new ShelfClient(http, "https://fail.example", TOKEN);
  await assert.rejects(failing.upload("x", undefined, bytes), (e: ShelfError) => e.status === 507 && e.message === "Kệ đầy");
});

test("remove: 404 coi như đã xóa; id lạ không gọi mạng", async () => {
  const { http, calls } = fakeHttp((req) => ({ status: req.url.endsWith("gone12345") ? 404 : 200, body: { ok: true } }));
  const shelf = new ShelfClient(http, "https://a.example", TOKEN);
  await shelf.remove("gone12345");
  await shelf.remove("../../api/account");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "DELETE");
});

test("planShelf: mới, sửa (thay bản cũ), bị xóa trên web, không đổi, ra khỏi phạm vi", () => {
  const state = {
    "a.md": { id: "id_a00000", mtime: 1, size: 10 },
    "b.md": { id: "id_b00000", mtime: 1, size: 10 },
    "c.md": { id: "id_c00000", mtime: 1, size: 10 },
    "gone.md": { id: "id_g00000", mtime: 1, size: 10 },
    "tay.md": { id: "id_t00000", mtime: 1, size: 10, manual: true },
  };
  const notes = [
    { path: "a.md", mtime: 1, size: 10 },
    { path: "b.md", mtime: 2, size: 10 },
    { path: "c.md", mtime: 1, size: 10 },
    { path: "new.md", mtime: 1, size: 5 },
  ];
  const onShelf = new Set(["id_a00000", "id_b00000", "id_g00000", "id_t00000"]);
  const plan = planShelf(notes, state, onShelf, { deleteRemoved: true });
  assert.deepEqual(plan.upload, [{ path: "b.md", replace: "id_b00000" }, { path: "c.md" }, { path: "new.md" }]);
  assert.deepEqual(plan.remove, [{ path: "gone.md", id: "id_g00000" }], "note gửi tay không bị đồng bộ xóa");
  assert.equal(plan.unchanged, 1);
  assert.deepEqual(planShelf(notes, state, onShelf, { deleteRemoved: false }).remove, []);
});
