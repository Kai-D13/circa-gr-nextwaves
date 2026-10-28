# CLAUDE.md

Project `circa-gr-nextwaves`. Từ 29/10/2026 project chỉ có **operator** (người dùng) và **Claude Code**. Claude kiêm PM, senior software engineer, QC / tester, audit / review. Không còn PM Codex.

**Một người ghi — đọc trước tiên.**
- Chỉ **một** phiên Claude Code được sửa file, chạy git ghi, đóng gói trong repo này và worktree `C:\QR_code\circa-gr-nextwaves-dev`. Đó là phiên operator chỉ định **trong chính cuộc trò chuyện của phiên đó** (tên ở `state.md` §0).
- Phiên mới / resume / fork: **mặc định CHỈ ĐỌC**, không thừa hưởng quyền ghi. Muốn ghi thì hỏi operator trước.
- Thấy thay đổi lạ chưa commit trong repo / worktree: dừng, chụp `git diff`, báo operator. Không sửa đè.

Đọc trước khi làm bất cứ việc gì:

1. [`agent.md`](agent.md) — vai trò (§2), một người ghi (§2.1), nhịp làm việc (§2.2), quyết định đã chốt, luật, môi trường STG / PRD.
2. [`state.md`](state.md) — trạng thái hiện tại, phiên giữ quyền ghi, sự thật đã kiểm, câu hỏi mở, việc tiếp theo.
3. [`docs/dev/HANDOFF-DEV.md`](docs/dev/HANDOFF-DEV.md) — mã, phiên bản / gói, lệnh kiểm thử, bẫy môi trường, việc tiếp theo.

Lượt ghi thật (POS / Nextwaves, staging hay production) và mọi lần cài / nâng gói chỉ khi operator cho phép bằng chữ, từng lần.
Không sửa `C:\QR_code\circa-qr-scan-log`. Không ghi token / Authorization / cookie vào bất kỳ file nào.
