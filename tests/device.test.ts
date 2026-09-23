import { test } from "node:test";
import assert from "node:assert/strict";
import { CrossPointClient, findDevice, HttpRequest } from "../src/device";

// Plugin dùng window.setTimeout (Obsidian); Node không có window
(globalThis as { window?: unknown }).window ??= globalThis;

function fakeHttp(routes: Record<string, (req: HttpRequest) => { status: number; text: string }>) {
  const calls: HttpRequest[] = [];
  const fn = async (req: HttpRequest) => {
    calls.push(req);
    const handler = routes[`${req.method} ${new URL(req.url).pathname}`];
    return handler ? handler(req) : { status: 404, text: "no route" };
  };
  return { fn, calls };
}

const statusJson = JSON.stringify({ version: "1.6.0", ip: "1.2.3.4", mode: "STA", device: "X4" });

test("status + ensureDir không tạo lại thư mục đã có", async () => {
  const { fn, calls } = fakeHttp({
    "GET /api/status": () => ({ status: 200, text: statusJson }),
    "GET /api/files": () => ({ status: 200, text: JSON.stringify([{ name: "Obsidian", size: 0, isDirectory: true, isEpub: false }]) }),
    "POST /mkdir": () => ({ status: 200, text: "ok" }),
  });
  const c = new CrossPointClient(fn, "crosspoint.local");
  assert.equal((await c.status()).device, "X4");
  await c.ensureDir("/Obsidian");
  assert.ok(!calls.some((r) => r.url.endsWith("/mkdir")));
});

test("ensureDir tạo thư mục khi chưa có", async () => {
  const { fn, calls } = fakeHttp({
    "GET /api/files": () => ({ status: 200, text: "[]" }),
    "POST /mkdir": () => ({ status: 200, text: "ok" }),
  });
  await new CrossPointClient(fn, "h").ensureDir("/Obsidian");
  assert.equal(calls.find((r) => r.url.endsWith("/mkdir"))?.body, "name=Obsidian&path=%2F");
});

test("upload gửi multipart tới đúng path và báo lỗi khi máy từ chối", async () => {
  const { fn, calls } = fakeHttp({ "POST /upload": () => ({ status: 200, text: "File uploaded successfully: a.epub" }) });
  await new CrossPointClient(fn, "h").upload("/Obsidian", "a.epub", new Uint8Array([1, 2, 3]));
  assert.equal(new URL(calls[0].url).search, "?path=%2FObsidian");
  assert.ok(calls[0].headers?.["Content-Type"]?.startsWith("multipart/form-data; boundary="));
  assert.ok(calls[0].body instanceof ArrayBuffer);

  const bad = fakeHttp({ "POST /upload": () => ({ status: 500, text: "SD full" }) });
  await assert.rejects(new CrossPointClient(bad.fn, "h").upload("/", "a.epub", new Uint8Array(0)), /lỗi 500/);
});

test("findDevice thử lần lượt và bỏ qua địa chỉ chết", async () => {
  const fn = async (req: HttpRequest) => {
    if (req.url.startsWith("http://dead/")) throw new Error("ECONNREFUSED");
    return { status: 200, text: statusJson };
  };
  const found = await findDevice(fn, ["dead", " ", "dead", "192.168.1.50"]);
  assert.equal(found?.client.host, "192.168.1.50");
  const none = await findDevice(async () => { throw new Error("x"); }, ["a", "b"]);
  assert.equal(none, null);
});

test("status quá hạn thì báo lỗi rõ", async () => {
  const never = () => new Promise<never>(() => {});
  await assert.rejects(new CrossPointClient(never, "h", 30).status(), /không phản hồi/);
});

test("listFilesRecursive và ensureDirRecursive đi qua từng cấp", async () => {
  const tree: Record<string, { name: string; isDirectory: boolean }[]> = {
    "/Obsidian": [{ name: "A.epub", isDirectory: false }, { name: "Sub", isDirectory: true }],
    "/Obsidian/Sub": [{ name: "B.epub", isDirectory: false }],
    "/": [{ name: "Obsidian", isDirectory: true }],
  };
  const made: string[] = [];
  const fn = async (req: HttpRequest) => {
    const u = new URL(req.url);
    if (u.pathname === "/api/files") {
      const p = u.searchParams.get("path") ?? "/";
      return { status: 200, text: JSON.stringify((tree[p] ?? []).map((e) => ({ ...e, size: 0, isEpub: false }))) };
    }
    if (u.pathname === "/mkdir") { made.push(String(req.body)); return { status: 200, text: "ok" }; }
    return { status: 404, text: "" };
  };
  const c = new CrossPointClient(fn, "h");
  assert.deepEqual(await c.listFilesRecursive("/Obsidian"), ["A.epub", "Sub/B.epub"]);
  await c.ensureDirRecursive("/Obsidian/Sub/New");
  assert.deepEqual(made, ["name=New&path=%2FObsidian%2FSub"]);
});
