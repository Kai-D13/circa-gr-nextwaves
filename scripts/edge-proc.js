// Tắt trình duyệt theo hồ sơ tạm + kiểm cổng CDP còn trống trước khi chạy (28/10). Edge có thể tự khởi chạy lại (vd. khi có bản cập
// nhật chờ): tiến trình spawn thoát, trình duyệt thật là tiến trình khác cùng dòng lệnh → `proc.kill()` theo PID không tắt được, lượt
// sau nối nhầm vào trình duyệt cũ qua cùng cổng (lượt đối chứng v0.2.3 đã chạy trên Edge còn sót của lượt v0.2.4).
"use strict";
const { spawnSync } = require("node:child_process");
const path = require("node:path");

function killProfile(prof) {
  const tag = path.basename(prof).replace(/'/g, "");
  spawnSync("powershell", [
    "-NoProfile",
    "-Command",
    `Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${tag}*' } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }`,
  ]);
}

async function portBusy(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) });
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = { killProfile, portBusy };
