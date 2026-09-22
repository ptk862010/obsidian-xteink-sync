import { test } from "node:test";
import assert from "node:assert/strict";
import { assignEpubNames, planSync, NoteInfo, SyncState } from "../src/sync";

const n = (path: string, title: string, mtime = 1, size = 10): NoteInfo => ({ path, title, mtime, size });

test("assignEpubNames: trùng tiêu đề thì thêm mã băm", () => {
  const names = assignEpubNames([n("a/Ghi chú.md", "Ghi chú"), n("b/Ghi chú.md", "Ghi chú"), n("c.md", "Khác")]);
  assert.notEqual(names.get("a/Ghi chú.md"), names.get("b/Ghi chú.md"));
  assert.ok(names.get("a/Ghi chú.md")!.startsWith("Ghi-chu-"));
  assert.equal(names.get("c.md"), "Khac.epub");
});

test("planSync phân loại new / changed / unchanged / missing", () => {
  const state: SyncState = {
    "old.md": { epub: "Cu.epub", mtime: 1, size: 10 },
    "same.md": { epub: "Giong.epub", mtime: 1, size: 10 },
    "gone.md": { epub: "Mat.epub", mtime: 1, size: 10 },
  };
  const notes = [n("old.md", "Cũ", 2, 10), n("same.md", "Giống"), n("gone.md", "Mất"), n("new.md", "Mới")];
  const plan = planSync(notes, state, new Set(["Cu.epub", "Giong.epub"]), { deleteRemoved: false });
  const reasons = Object.fromEntries(plan.upload.map((u) => [u.note.path, u.reason]));
  assert.deepEqual(reasons, { "old.md": "changed", "gone.md": "missing", "new.md": "new" });
  assert.equal(plan.unchanged, 1);
  assert.deepEqual(plan.delete, []);
});

test("planSync xóa note ra khỏi phạm vi và file cũ khi đổi tên, chỉ khi cho phép", () => {
  const state: SyncState = {
    "a.md": { epub: "Ten-cu.epub", mtime: 1, size: 10 },
    "removed.md": { epub: "Da-bo.epub", mtime: 1, size: 10 },
  };
  const notes = [n("a.md", "Tên mới")];
  const withDelete = planSync(notes, state, null, { deleteRemoved: true });
  assert.equal(withDelete.upload[0].reason, "renamed");
  assert.deepEqual(withDelete.delete.sort(), ["Da-bo.epub", "Ten-cu.epub"]);
  assert.deepEqual(planSync(notes, state, null, { deleteRemoved: false }).delete, []);
});

test("planSync không có danh sách máy thì không đoán 'missing'", () => {
  const plan = planSync([n("s.md", "S")], { "s.md": { epub: "S.epub", mtime: 1, size: 10 } }, null, { deleteRemoved: false });
  assert.equal(plan.unchanged, 1);
});

test("deviceSubdir slug hóa từng cấp; assignEpubNames chỉ coi trùng khi cùng thư mục", () => {
  const { deviceSubdir } = require("../src/sync");
  assert.equal(deviceSubdir("03 - Resources/Books & Reading"), "03-Resources/Books-Reading");
  assert.equal(deviceSubdir(""), "");
  const names = assignEpubNames([
    { ...n("a/Ghi chú.md", "Ghi chú"), dir: "a" },
    { ...n("b/Ghi chú.md", "Ghi chú"), dir: "b" },
  ]);
  assert.equal(names.get("a/Ghi chú.md"), "a/Ghi-chu.epub");
  assert.equal(names.get("b/Ghi chú.md"), "b/Ghi-chu.epub");
});

test("planSync: bật giữ thư mục thì note cũ (đổ phẳng) thành 'renamed' và xóa file phẳng", () => {
  const state: SyncState = { "x/A.md": { epub: "A.epub", mtime: 1, size: 10 } };
  const plan = planSync([{ ...n("x/A.md", "A"), dir: "x" }], state, new Set(["A.epub"]), { deleteRemoved: true });
  assert.equal(plan.upload[0].reason, "renamed");
  assert.equal(plan.upload[0].epub, "x/A.epub");
  assert.deepEqual(plan.delete, ["A.epub"]);
});
