# Pack site + SQLite for FTP deploy (no node_modules, no duplicated uploads).
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$Out = Join-Path $Root 'dist-deploy'
$Code = Join-Path $Out 'code'

Write-Host 'Stop npm run dev first so SQLite can close WAL files.'

if (Test-Path $Out) {
  Remove-Item -Recurse -Force $Out
}
New-Item -ItemType Directory -Path $Code | Out-Null

foreach ($dir in @('src', 'views', 'scripts', 'deploy')) {
  $src = Join-Path $Root $dir
  if (Test-Path $src) {
    Write-Host "Copy $dir/"
    Copy-Item -Recurse $src (Join-Path $Code $dir)
  }
}

$PublicSrc = Join-Path $Root 'public'
$PublicDest = Join-Path $Code 'public'
New-Item -ItemType Directory -Path $PublicDest | Out-Null
Write-Host 'Copy public/ (skipping uploads)'
robocopy $PublicSrc $PublicDest /E /XD uploads /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) {
  throw "robocopy public failed with exit code $LASTEXITCODE"
}
New-Item -ItemType Directory -Path (Join-Path $PublicDest 'uploads') -Force | Out-Null
$Gitkeep = Join-Path $PublicSrc 'uploads\.gitkeep'
if (Test-Path $Gitkeep) {
  Copy-Item $Gitkeep (Join-Path $PublicDest 'uploads\.gitkeep')
}

foreach ($file in @('package.json', 'package-lock.json', 'tsconfig.json', 'app.js', 'README.md')) {
  $src = Join-Path $Root $file
  if (Test-Path $src) {
    Copy-Item $src (Join-Path $Code $file)
  }
}

$DataSrc = Join-Path $Root 'data'
$DataDest = Join-Path $Code 'data'
New-Item -ItemType Directory -Path $DataDest -Force | Out-Null
foreach ($dbFile in @('fortuna.db', 'fortuna.db-wal', 'fortuna.db-shm')) {
  $src = Join-Path $DataSrc $dbFile
  if (Test-Path $src) {
    Write-Host "Copy data/$dbFile"
    Copy-Item $src (Join-Path $DataDest $dbFile)
  }
}

Write-Host ''
Write-Host "Ready: $Out\code"
Write-Host 'Creating fortuna-hosting-code.zip ...'
$Zip = Join-Path $Out 'fortuna-hosting-code.zip'
if (Test-Path $Zip) { Remove-Item -Force $Zip }
Compress-Archive -Path (Join-Path $Code '*') -DestinationPath $Zip -CompressionLevel Optimal
Write-Host "Zip: $Zip"
Write-Host 'Upload the folder or the zip to the Node app root (e.g. ~/fortuna).'
Write-Host 'Then upload local public\uploads\ into ~/fortuna/public/uploads/ (about 5 GB, FileZilla).'
Write-Host 'On the server: npm ci --omit=dev'
Write-Host 'See deploy/shared-hosting.md'
exit 0
