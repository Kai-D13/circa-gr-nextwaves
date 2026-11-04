// v0.3.1 — CHỐT CHẶN trước khi quét (chỉ đọc): chạy SAU khi bấm "Xác nhận cho phép" tự động, NGAY TRƯỚC khi đặt tem lên đầu đọc.
// Service worker → Console → sửa mã phiếu ở dòng GR → dán → Enter. Phải in "SẴN SÀNG QUÉT: …". In "DỪNG: …" thì không quét.
// Đối chiếu quyền tự động với phiên theo đúng các trường background kiểm lúc nhận (autoGrantFits), cộng hạn còn ≥ 10 phút và tập tem.
// Phiên bị Xoá / Huỷ rồi mở lại (G3 lượt 2, 30/10) → quyền cũ mất → in DỪNG: cho phép lại rồi chạy lại đoạn này.
{
  const GR = "GR?????"; // ← mã phiếu, ví dụ GR03929
  chrome.storage.local.get(["sessions", "autoGrants"]).then(({ sessions = {}, autoGrants = {} }) => {
    const s = Object.values(sessions).find((x) => x.grCode === GR);
    const g = s && autoGrants[s.key];
    const epcs = s ? [...new Set(((s.expected && s.expected.shipments) || []).flatMap((x) => x.lines.flatMap((l) => l.units.map((u) => String(u.epc || "").toUpperCase()))).filter(Boolean))].sort() : [];
    const phut = g ? Math.floor((g.expiresAt - Date.now()) / 60000) : 0;
    const loi = [];
    if (!s) loi.push(`không có phiên ${GR}`);
    else {
      if (s.state !== "nw_ready") loi.push(`phiên không ở trạng thái Đã khớp đơn Nextwaves (${s.state})`);
      if (s.scanOk) loi.push("Nextwaves đã ghi nhận lượt xác nhận nhận hàng");
      if ((s.receiptIdsBefore || []).length) loi.push("PO đã có biên nhận");
      if ([].concat(s.writeLocks || [], s.nwWriteLocks || []).length) loi.push("phiên bị khoá điền");
      if (!g) loi.push("CHƯA có quyền tự động — bấm “Cho phép tự điền và HOÀN THÀNH 1 lần” trong dòng phiên ở mục “Phiên gần đây”");
      else {
        const lech = ["key", "envId", "grId", "posId", "soBase", "nwPoId", "warehouseId"].filter((k) => g[k] !== s[k]);
        if (g.sessionCreatedAt !== s.createdAt) lech.push("phiên đã bị tạo lại");
        if (lech.length) loi.push(`quyền không khớp phiên: ${lech.join(", ")} — cho phép lại`);
        if (phut < 10) loi.push(`quyền còn ${Math.max(phut, 0)} phút — bấm “Thu hồi tự động” rồi cho phép lại`);
        if (g.epcs.length !== epcs.length || g.epcs.some((e, i) => e !== epcs[i])) loi.push("tập tem trong quyền khác phiên");
      }
    }
    console.log(loi.length ? `DỪNG: ${loi.join("; ")}` : `SẴN SÀNG QUÉT: ${s.grCode} · ${s.nwPoNumber} · ${epcs.length} tem · quyền còn ${phut} phút`);
  });
}
