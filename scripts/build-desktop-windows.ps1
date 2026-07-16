param(
    [switch]$SkipDependencyInstall
)

$ErrorActionPreference = "Stop"

$RootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$FrontendDir = Join-Path $RootDir "frontend"
$BackendDir = Join-Path $RootDir "backend"
$TauriDir = Join-Path $RootDir "src-tauri"
$TargetTriple = "x86_64-pc-windows-msvc"
$BackendBinary = Join-Path $BackendDir "target\$TargetTriple\release\drop-den-backend.exe"
$SidecarDir = Join-Path $TauriDir "binaries"
$SidecarBinary = Join-Path $SidecarDir "drop-den-backend-$TargetTriple.exe"
$TauriCli = Join-Path $FrontendDir "node_modules\.bin\tauri.cmd"

function Assert-LastExitCode([string]$Step) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed with exit code $LASTEXITCODE."
    }
}

Write-Host "==> Building Drop Den for 64-bit Windows"

$RustVersion = & rustc -vV
Assert-LastExitCode "Rust toolchain inspection"
$RustHostLine = $RustVersion | Where-Object { $_ -like "host: *" } | Select-Object -First 1

if (-not $RustHostLine) {
    throw "Could not determine the active Rust host from rustc -vV."
}

$RustHost = $RustHostLine.Substring(6).Trim()
if ($RustHost -ne $TargetTriple) {
    throw "Expected Rust host $TargetTriple, but found $RustHost. Run this build on 64-bit Windows with the MSVC toolchain."
}

Write-Host "Rust host: $RustHost"

if (-not $SkipDependencyInstall) {
    Write-Host "==> Installing frontend dependencies"
    Push-Location $FrontendDir
    try {
        & yarn install --frozen-lockfile
        Assert-LastExitCode "Frontend dependency installation"
    }
    finally {
        Pop-Location
    }
}

Write-Host "==> Building backend sidecar"
Push-Location $BackendDir
try {
    & cargo build --release --target $TargetTriple
    Assert-LastExitCode "Backend release build"
}
finally {
    Pop-Location
}

if (-not (Test-Path $BackendBinary -PathType Leaf)) {
    throw "Backend build did not produce $BackendBinary. Run this script on 64-bit Windows with the MSVC Rust toolchain."
}

Write-Host "==> Preparing Windows sidecar"
New-Item -ItemType Directory -Force -Path $SidecarDir | Out-Null
Copy-Item -Force $BackendBinary $SidecarBinary

if (-not (Test-Path $SidecarBinary -PathType Leaf)) {
    throw "Windows sidecar was not created at $SidecarBinary."
}

if ((Get-Item $BackendBinary).Length -ne (Get-Item $SidecarBinary).Length) {
    throw "Prepared sidecar does not match the backend build output."
}

Write-Host "Sidecar ready: $SidecarBinary"

if (-not (Test-Path $TauriCli -PathType Leaf)) {
    throw "Tauri CLI is missing at $TauriCli. Install frontend dependencies first."
}

Write-Host "==> Building NSIS installer"
Push-Location $RootDir
try {
    & $TauriCli build --ci
    Assert-LastExitCode "Tauri Windows build"
}
finally {
    Pop-Location
}

$BundleDir = Join-Path $TauriDir "target\release\bundle\nsis"
$Installers = @(Get-ChildItem -Path $BundleDir -Filter "*-setup.exe" -File -ErrorAction SilentlyContinue)

if ($Installers.Count -eq 0) {
    throw "Tauri completed without producing an NSIS installer under $BundleDir."
}

Write-Host ""
Write-Host "Drop Den Windows build complete."
Write-Host "Installer output: $BundleDir"
$Installers | ForEach-Object { Write-Host "  $($_.FullName)" }
