<#
  Nâng circa-gr-nextwaves v0.2.4 (0BB73E2D) → v0.2.5 (792817B9) TRONG CÙNG thư mục Chrome đang tải: giữ Extension ID nên giữ phiên
  và cấu hình (PM AUDIT-A1-GR03887-STG-v0.2.4-20261028 §2). Script không đụng Chrome. Chạy xong, operator bấm Reload (↻) trên thẻ
  "Circa GR ← Nextwaves" ở chrome://extensions rồi F5 mọi tab POS / Nextwaves.

    powershell -NoProfile -ExecutionPolicy Bypass -File C:\circa-gr-nextwaves-release\nang-cap-v0.2.5.ps1 -Check   # chỉ kiểm
    powershell -NoProfile -ExecutionPolicy Bypass -File C:\circa-gr-nextwaves-release\nang-cap-v0.2.5.ps1          # kiểm + sao lưu + chép đè

  -Target  thư mục extension Chrome đang tải (dòng "Tải từ / Loaded from" trên thẻ). Mặc định C:\circa-gr-nextwaves-v0.2.3 (thư mục giữ tên cũ
           từ lần nâng v0.2.3 → v0.2.4; nâng cùng thư mục để giữ Extension ID).
  -Release thư mục giao gói (có v0.2.5\ và v0.2.4\). Mặc định: thư mục chứa script.
  Thoát 0 = đạt (hoặc thư mục đã là v0.2.5); 1 = dừng, thư mục đích không bị đổi.
#>
param(
  [string]$Target = 'C:\circa-gr-nextwaves-v0.2.3',
  [string]$Release = $PSScriptRoot,
  [switch]$Check
)
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
Add-Type -AssemblyName System.IO.Compression.FileSystem

$NewZip = Join-Path $Release 'v0.2.5\circa-gr-nextwaves-v0.2.5.zip'
$OldZip = Join-Path $Release 'v0.2.4\circa-gr-nextwaves-v0.2.4.zip'
$NewSha = '792817B909171EE7A6DC4EA2B86D5BBFEAC396F81633593226177AA72FD63A64'
$OldSha = '0BB73E2D8297840CD1796D5510BB5350302A6212FCF8386B16E9A66188C03D57'

function Fail([string]$msg) { Write-Host "DỪNG: $msg" -ForegroundColor Red; exit 1 }

# Đường dẫn tương đối → SHA-256 của mọi file trong thư mục. Ghép tên từng cấp (không cắt FullName: %TEMP% dạng 8.3 ADMINI~1
# làm FullName của file con dài hơn đường dẫn gốc).
function Add-Tree($map, [string]$dir, [string]$prefix) {
  foreach ($c in Get-ChildItem -LiteralPath $dir -Force) {
    if ($c.PSIsContainer) { Add-Tree $map $c.FullName ($prefix + $c.Name + '/') }
    else { $map[$prefix + $c.Name] = (Get-FileHash -LiteralPath $c.FullName -Algorithm SHA256).Hash }
  }
}
function Get-Tree([string]$dir) {
  $map = @{}
  Add-Tree $map $dir ''
  return $map
}

# Chỗ khác giữa cây kỳ vọng và cây thật (rỗng = giống từng byte).
function Compare-Tree($want, $have) {
  $out = @()
  foreach ($k in $want.Keys) { if (-not $have.ContainsKey($k)) { $out += "thiếu $k" } elseif ($want[$k] -ne $have[$k]) { $out += "khác $k" } }
  foreach ($k in $have.Keys) { if (-not $want.ContainsKey($k)) { $out += "thừa $k" } }
  return ,$out
}

function Copy-Files($keys, [string]$from, [string]$to) {
  foreach ($rel in $keys) {
    $p = $rel.Replace('/', '\')
    $dst = Join-Path $to $p
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
    Copy-Item -LiteralPath (Join-Path $from $p) -Destination $dst -Force
  }
}

# Chép trả từ bản sao lưu chỉ những file đã bị đổi (file đang bị khoá mà chưa đổi thì không đụng tới).
function Restore-Files($want, [string]$from, [string]$to) {
  foreach ($rel in $want.Keys) {
    $p = Join-Path $to $rel.Replace('/', '\')
    if ((Test-Path -LiteralPath $p) -and (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash -eq $want[$rel]) { continue }
    Copy-Files @($rel) $from $to
  }
}

Write-Host "Gói giao: $Release"
foreach ($p in @(@($NewZip, $NewSha, 'v0.2.5'), @($OldZip, $OldSha, 'v0.2.4'))) {
  if (-not (Test-Path -LiteralPath $p[0])) { Fail "không thấy gói $($p[2]): $($p[0])" }
  $h = (Get-FileHash -LiteralPath $p[0] -Algorithm SHA256).Hash
  if ($h -ne $p[1]) { Fail "SHA-256 gói $($p[2]) sai: $h (cần $($p[1]))" }
  Write-Host "  gói $($p[2]) SHA-256 đúng ($($h.Substring(0, 8)))"
}
if (-not (Test-Path -LiteralPath (Join-Path $Target 'manifest.json'))) { Fail "không thấy extension ở $Target" }

$work = Join-Path $env:TEMP ('cgn-upg-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
$backup = $null
$copying = $false
try {
  [System.IO.Compression.ZipFile]::ExtractToDirectory($OldZip, (Join-Path $work 'old'))
  [System.IO.Compression.ZipFile]::ExtractToDirectory($NewZip, (Join-Path $work 'new'))
  $old = Get-Tree (Join-Path $work 'old')
  $new = Get-Tree (Join-Path $work 'new')
  $cur = Get-Tree $Target
  if ((Compare-Tree $new $cur).Count -eq 0) {
    Write-Host "Thư mục $Target đã là v0.2.5 (792817B9) từng byte — không chép lại. Thẻ extension chưa hiện 0.2.5 thì bấm Reload." -ForegroundColor Green
    exit 0
  }
  $d = Compare-Tree $old $cur
  if ($d.Count -ne 0) { Fail ("thư mục $Target không đúng v0.2.4 (0BB73E2D): " + ($d -join '; ')) }
  Write-Host "  thư mục $Target đúng v0.2.4 (0BB73E2D) từng byte, $($cur.Count) file"
  $dn = Compare-Tree $old $new
  if (@($dn | Where-Object { $_ -notlike 'khác *' }).Count -ne 0) { Fail ("danh sách file v0.2.4 / v0.2.5 khác nhau: " + ($dn -join '; ')) }
  if ($Check) {
    Write-Host "KIỂM ĐẠT — chưa đổi gì. Chạy lại không có -Check để nâng." -ForegroundColor Green
    exit 0
  }

  $backup = Join-Path $Release ('backup\v0.2.4-dang-tai-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  New-Item -ItemType Directory -Force -Path $backup | Out-Null
  Copy-Files $old.Keys $Target $backup
  if ((Compare-Tree $old (Get-Tree $backup)).Count -ne 0) { Fail "bản sao lưu không khớp v0.2.4 — chưa chép đè gì" }
  Write-Host "  đã sao lưu bản đang tải: $backup"

  $copying = $true
  Copy-Files $new.Keys (Join-Path $work 'new') $Target
  $d2 = Compare-Tree $new (Get-Tree $Target)
  if ($d2.Count -ne 0) { throw ("thư mục không khớp v0.2.5 sau khi chép: " + ($d2 -join '; ')) }
  $copying = $false
  $ver = (Get-Content -LiteralPath (Join-Path $Target 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
  Write-Host "ĐÃ NÂNG: $Target giờ là v$ver (792817B9) từng byte, $($new.Count) file." -ForegroundColor Green
  Write-Host "Tiếp theo: chrome://extensions → thẻ 'Circa GR ← Nextwaves' → Reload (↻) → F5 mọi tab POS / Nextwaves."
  exit 0
} catch {
  $msg = $_.Exception.Message
  if ($copying) {
    # Lỗi giữa lúc chép đè: trả lại v0.2.4 từ bản sao lưu đã đối chiếu.
    try {
      Restore-Files $old $backup $Target
      if ((Compare-Tree $old (Get-Tree $Target)).Count -eq 0) { Fail "$msg — đã chép trả v0.2.4 từ bản sao lưu, thư mục như trước khi chạy" }
    } catch {}
    Fail "$msg — CHƯA trả lại được v0.2.4; KHÔNG Reload, báo dev (bản sao lưu: $backup)"
  }
  Fail "$msg — chưa chép đè gì, thư mục đích giữ nguyên"
} finally {
  Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}
