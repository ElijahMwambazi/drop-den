param(
    [switch]$SkipDependencyInstall
)

$ErrorActionPreference = "Stop"

$RootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$FrontendDir = Join-Path $RootDir "frontend"
$BackendDir = Join-Path $RootDir "backend"
$TauriDir = Join-Path $RootDir "src-tauri"
$TargetTriple = "x86_64-pc-windows-msvc"
$BackendBinary = Join-Path $BackendDir "target\release\drop-den-backend.exe"
$SidecarDir = Join-Path $TauriDir "binaries"
$SidecarBinary = Join-Path $SidecarDir "drop-den-backend-$TargetTriple.exe"
$TauriCli = Join-Path $FrontendDir "node_modules\.bin\tauri.cmd"

function Assert-LastExitCode([string]$Step) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed with exit code $LASTEXITCODE."
    }
}

Write-Host "==> Building Drop Den for 64-bit Windows"

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
    & cargo build --release
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

if (-not (Test-Path $TauriCli -PathType Leaf)) {
    throw "Tauri CLI is missing at $TauriCli. Install frontend dependencies first."
}

Write-Host "==> Building NSIS installer"
Push-Location $RootDir
try {
    & $TauriCli build
    Assert-LastExitCode "Tauri Windows build"
}
finally {
    Pop-Location
}

$BundleDir = Join-Path $TauriDir "target\release\bundle\nsis"
Write-Host ""
Write-Host "Drop Den Windows build complete."
Write-Host "Installer output: $BundleDir"
