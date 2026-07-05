$ErrorActionPreference = 'Stop'

$project = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$release = Join-Path $project 'release'
$temporary = Join-Path $release 'win-unpacked.tmp'
$unpacked = Join-Path $release 'win-unpacked'
$builder = Join-Path $project 'node_modules\.bin\electron-builder.cmd'

& $builder
if ($LASTEXITCODE -eq 0) {
  exit 0
}
$builderExitCode = $LASTEXITCODE

# На некоторых сборках Windows антивирус на мгновение блокирует rename,
# выполняемый electron-builder. К этому моменту временная папка уже готова.
if (-not (Test-Path -LiteralPath $temporary)) {
  exit $builderExitCode
}

if (Test-Path -LiteralPath $unpacked) {
  $resolvedRelease = (Resolve-Path $release).Path
  $resolvedUnpacked = (Resolve-Path $unpacked).Path
  if (-not $resolvedUnpacked.StartsWith($resolvedRelease + [IO.Path]::DirectorySeparatorChar)) {
    throw "Unsafe build path: $resolvedUnpacked"
  }
  Remove-Item -LiteralPath $resolvedUnpacked -Recurse -Force
}

Move-Item -LiteralPath $temporary -Destination $unpacked

# Завершаем подготовку portable-приложения, на которой остановился builder:
# добавляем production-зависимости, упаковываем app.asar и даём exe имя продукта.
$stage = Join-Path $release 'app-stage'
if (Test-Path -LiteralPath $stage) {
  Remove-Item -LiteralPath $stage -Recurse -Force
}
New-Item -ItemType Directory -Path $stage | Out-Null
Copy-Item -LiteralPath (Join-Path $project 'dist') -Destination $stage -Recurse
Copy-Item -LiteralPath (Join-Path $project 'electron') -Destination $stage -Recurse
Copy-Item -LiteralPath (Join-Path $project 'assets') -Destination $stage -Recurse
Copy-Item -LiteralPath (Join-Path $project 'package.json') -Destination $stage
Copy-Item -LiteralPath (Join-Path $project 'package-lock.json') -Destination $stage

& npm.cmd install --prefix $stage --omit=dev --ignore-scripts --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$resources = Join-Path $unpacked 'resources'
$appArchive = Join-Path $resources 'app.asar'
$asar = Join-Path $project 'node_modules\.bin\asar.cmd'
& $asar pack $stage $appArchive
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$defaultApp = Join-Path $resources 'default_app.asar'
if (Test-Path -LiteralPath $defaultApp) {
  Remove-Item -LiteralPath $defaultApp -Force
}
$electronExe = Join-Path $unpacked 'electron.exe'
$productExe = Join-Path $unpacked 'BotDesk.exe'
Move-Item -LiteralPath $electronExe -Destination $productExe
Remove-Item -LiteralPath $stage -Recurse -Force

& $builder --prepackaged $unpacked
exit $LASTEXITCODE
