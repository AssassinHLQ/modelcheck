param(
    [Parameter(Mandatory = $true)]
    [string]$InputFolder,
    [string]$OutputFolder = "",
    [string]$RhinoExe = "C:\Program Files\Rhino 8\System\Rhino.exe",
    [switch]$IncludeSubfolders
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $RhinoExe)) {
    Write-Host "未找到 Rhino：$RhinoExe" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $InputFolder)) {
    Write-Host "输入目录不存在：$InputFolder" -ForegroundColor Red
    exit 1
}
if ($OutputFolder -eq "") { $OutputFolder = $InputFolder }
New-Item -ItemType Directory -Path $OutputFolder -Force | Out-Null

$pattern = "*.sldprt", "*.sldasm"
if ($IncludeSubfolders) {
    $files = Get-ChildItem -Path $InputFolder -Include $pattern -Recurse -File
} else {
    $files = Get-ChildItem -Path $InputFolder -Include $pattern -File
}

if ($files.Count -eq 0) {
    Write-Host "输入目录中没有找到 .sldprt / .sldasm 文件" -ForegroundColor Yellow
    exit 0
}

Write-Host "找到 $($files.Count) 个 SolidWorks 文件，开始转换…"
$ok = 0
$fail = 0

foreach ($f in $files) {
    $out = Join-Path $OutputFolder ($f.BaseName + ".step")
    if (Test-Path $out) { Remove-Item $out -Force }
    $script = "-_Open ""$($f.FullName)"" _-Enter -_Export ""$out"" _-Enter -_Close _-Enter"
    $p = Start-Process -FilePath $RhinoExe -ArgumentList "-nosplash", "-runscript=`"$script`"" -Wait -PassThru -WindowStyle Hidden
    Start-Sleep -Milliseconds 500
    if (Test-Path $out) {
        Write-Host "  [OK] $($f.Name) -> $($out)" -ForegroundColor Green
        $ok++
    } else {
        Write-Host "  [FAIL] $($f.Name)（Rhino 退出码 $($p.ExitCode)）" -ForegroundColor Red
        $fail++
    }
}

Write-Host "完成：成功 $ok 个，失败 $fail 个。输出目录：$OutputFolder"
