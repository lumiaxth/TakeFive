#
# TakeFive - Website Time Tracker & Blocker
# Copyright (C) 2026  Xue Tianhao (GitHub: @lumiaxth)
#
# 打包脚本：按白名单复制商店所需文件到 staging，压缩为 dist/takefive-v<version>.zip。
# 用法：在仓库根目录执行  powershell -ExecutionPolicy Bypass -File build.ps1
#

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$manifest = Get-Content (Join-Path $root 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$version = $manifest.version
$outDir = Join-Path $root 'dist'
$zipPath = Join-Path $outDir "takefive-v$version.zip"
$stage = Join-Path $env:TEMP ("takefive-pack-$version")

# 商店包白名单：manifest 必须位于 zip 根
$include = @(
  'manifest.json',
  'background.js',
  'content',
  'popup',
  'options',
  'dashboard',
  'blocked',
  'welcome',
  'shared',
  '_locales',
  'icons'
)


Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $stage | Out-Null
foreach ($item in $include) {
  Copy-Item (Join-Path $root $item) -Destination $stage -Recurse -Force
}

New-Item -ItemType Directory -Path $outDir -Force | Out-Null
Remove-Item $zipPath -Force -ErrorAction SilentlyContinue

# 使用 .NET ZipArchive 手写条目：强制正斜杠分隔符（Compress-Archive 在 PS5.1 会用反斜杠）
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipStream = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($file in (Get-ChildItem $stage -Recurse -File)) {
    $rel = $file.FullName.Substring($stage.Length + 1).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zipStream, $file.FullName, $rel, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally {
  $zipStream.Dispose()
}
Remove-Item $stage -Recurse -Force

# 校验：zip 根必须包含 manifest.json
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$hasManifest = $zip.Entries | Where-Object { $_.FullName -eq 'manifest.json' }
$entryCount = $zip.Entries.Count
$zip.Dispose()
if (-not $hasManifest) {
  Remove-Item $zipPath -Force
  throw 'manifest.json is missing at the zip root - package aborted'
}

$sizeKb = [math]::Round((Get-Item $zipPath).Length / 1KB, 1)
Write-Output "PACKAGED dist/takefive-v$version.zip ($entryCount entries, $sizeKb KB, manifest at zip root OK)"
