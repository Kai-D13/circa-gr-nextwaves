// Preflight CHỈ ĐỌC khung v0.2.4 trên trang phiếu POS thật (runbook A1 §0d). Dán vào Console (F12) của tab POS đang mở trang GR03887.
// Không bấm, không gõ, không gọi mạng: chỉ cuộn trang và hỏi trình duyệt "điểm giữa mỗi nút / ô của vùng sản phẩm, HỦY, HOÀN THÀNH
// đang trúng phần tử nào". Trúng khung extension = bị che. In một dòng JSON; KET_QUA "ĐẠT" hoặc "XEM LẠI".
// scripts/edge-gr-page.js chạy đúng đoạn này trên trang thật dựng lại (mã phiếu thay bằng mã của bài kiểm).
(() => {
  const WANT = "GR03887";
  const a = document.getElementById("all-receipt");
  const hosts = [...document.querySelectorAll("[data-cgn-panel]")];
  const h = hosts[0] || null;
  let info = a && a.previousElementSibling;
  while (info && info.hasAttribute("data-cgn-panel")) info = info.previousElementSibling;
  const codes = info ? [...new Set(info.textContent.match(/GR\d+/g) || [])] : [];
  const at = (el) => {
    const b = el.getBoundingClientRect();
    return document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
  };
  const hitOk = (el) => {
    const x = at(el);
    return !!x && (x === el || el.contains(x));
  };
  const name = (el) => {
    const x = at(el);
    const who = !x ? "không có" : x.closest("[data-cgn-panel]") ? "KHUNG EXTENSION" : x.tagName + "." + String(x.className).slice(0, 24);
    return (el.textContent || el.value || el.placeholder || el.tagName).trim().slice(0, 20) + " → " + who;
  };
  const els = a ? [...a.querySelectorAll("button, input")].filter((e) => e.getBoundingClientRect().width > 0) : [];
  const bar = [...document.querySelectorAll("div.fixed.bottom-0 button")];
  const bad = [];
  const y0 = scrollY;
  for (const el of els) {
    el.scrollIntoView({ block: "center", inline: "nearest" });
    if (!hitOk(el)) bad.push(name(el));
  }
  scrollTo(0, y0);
  for (const el of bar) if (!hitOk(el)) bad.push(name(el));
  const out = {
    vw: innerWidth,
    vh: innerHeight,
    khung: hosts.length,
    trongLuong: hosts.filter((x) => x.hasAttribute("data-cgn-inline")).length,
    ngayTruocBangSanPham: !!h && !!a && h.nextElementSibling === a,
    position: h ? getComputedStyle(h).position : null,
    maPhieuTheThongTin: codes,
    dieuKhienVungSanPham: els.length,
    nutCuoiTrang: bar.map((b) => b.textContent.trim()),
    biChe: bad,
  };
  out.KET_QUA =
    out.khung === 1 && out.trongLuong === 1 && out.ngayTruocBangSanPham && out.position === "static" &&
    codes.length === 1 && codes[0] === WANT && els.length > 0 && bar.length === 2 && bad.length === 0
      ? "ĐẠT"
      : "XEM LẠI";
  return JSON.stringify(out);
})();
