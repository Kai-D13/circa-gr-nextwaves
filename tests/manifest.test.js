"use strict";
// Cấu trúc manifest so với cách Chrome / Edge nạp content script (lỗi T1 25/10: lib/env.js khai ở cả mục MAIN và ISOLATED
// → trình duyệt chỉ nạp một lần vào mục đứng trước (MAIN) → content script ISOLATED thiếu __CGN__.env → "Lỗi extension").
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SRC = path.join(__dirname, "..", "src");
const MANIFEST = JSON.parse(fs.readFileSync(path.join(SRC, "manifest.json"), "utf8"));
const CS = MANIFEST.content_scripts;
const originsOf = (c) => c.matches.map((m) => m.replace(/\/\*$/, ""));
const overlap = (a, b) => originsOf(a).some((o) => originsOf(b).includes(o));

test("không file nào nằm ở hai mục content_scripts cùng khớp một trang (trình duyệt chỉ nạp một lần)", () => {
  for (let i = 0; i < CS.length; i++) {
    for (let j = i + 1; j < CS.length; j++) {
      if (!overlap(CS[i], CS[j])) continue;
      const shared = CS[i].js.filter((f) => CS[j].js.includes(f));
      assert.deepEqual(shared, [], `mục ${i} (${CS[i].world || "ISOLATED"}) và mục ${j} (${CS[j].world || "ISOLATED"}) dùng chung ${shared.join(", ")}`);
    }
  }
});

test("mỗi trang: MAIN world có env + hook, ISOLATED world có env + thư viện + content script; mọi file tồn tại", () => {
  for (const c of CS) for (const f of c.js) assert.ok(fs.existsSync(path.join(SRC, f)), `thiếu file ${f}`);
  for (const origin of ["https://pos.stg.circa-v2.buymed.tech", "https://pos.v2.circa.vn", "https://circa-stg.nextwaves.app", "https://circa.nextwaves.app"]) {
    const here = CS.filter((c) => originsOf(c).includes(origin));
    const main = here.filter((c) => c.world === "MAIN").flatMap((c) => c.js);
    const iso = here.filter((c) => c.world !== "MAIN").flatMap((c) => c.js);
    const pos = origin.includes("pos.");
    assert.deepEqual(main, ["main/env.js", pos ? "pos/pos-hook.js" : "nw/nw-hook.js"], origin);
    assert.equal(iso[0], "lib/env.js", `${origin}: ISOLATED phải nạp lib/env.js đầu tiên`);
    assert.equal(iso[iso.length - 1], pos ? "pos/pos-content.js" : "nw/nw-content.js", origin);
  }
});

test("src/main/env.js là bản sao y hệt src/lib/env.js", () => {
  const a = fs.readFileSync(path.join(SRC, "lib", "env.js"));
  const b = fs.readFileSync(path.join(SRC, "main", "env.js"));
  assert.ok(a.equals(b), "sửa lib/env.js thì chép lại sang main/env.js");
});
