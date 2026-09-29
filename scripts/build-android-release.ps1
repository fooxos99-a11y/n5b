param(
  [ValidateSet('nukhab')]
  [string]$Brand = 'nukhab'
)

$ErrorActionPreference = 'Stop'

node (Join-Path $PSScriptRoot 'check-android-push.mjs') $Brand
if ($LASTEXITCODE -ne 0) { throw 'Android push configuration validation failed.' }

function Remove-BuildJunctionSafely([string]$junctionPath) {
  $resolvedTemp = [IO.Path]::GetFullPath($env:TEMP).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  $resolvedJunction = [IO.Path]::GetFullPath($junctionPath)
  if (-not $resolvedJunction.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove Android build junction outside the temporary directory: $resolvedJunction"
  }
  if ([IO.Directory]::Exists($resolvedJunction)) {
    [IO.Directory]::Delete($resolvedJunction)
  }
}

$signingDirectory = Join-Path $env:USERPROFILE '.android-signing'
$signingName = 'nukhab'
$keystorePath = Join-Path $signingDirectory "$signingName-release.jks"
$protectedPasswordPath = Join-Path $signingDirectory "$signingName-release-password.dpapi"

if (-not (Test-Path -LiteralPath $keystorePath) -or -not (Test-Path -LiteralPath $protectedPasswordPath)) {
  throw "$Brand Android signing material is unavailable."
}

$protectedPassword = (Get-Content -LiteralPath $protectedPasswordPath -Raw).Trim()
$securePassword = ConvertTo-SecureString $protectedPassword
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  $env:ANDROID_RELEASE_KEYSTORE_PATH = $keystorePath
  $env:ANDROID_RELEASE_KEYSTORE_PASSWORD = $plainPassword
  $env:ANDROID_RELEASE_KEY_PASSWORD = $plainPassword
  $env:ANDROID_RELEASE_KEY_ALIAS = $signingName
  if (-not $env:ANDROID_HOME) {
    $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
  }

  npm run native:android
  if ($LASTEXITCODE -ne 0) { throw "$Brand native Android preparation failed with exit code $LASTEXITCODE." }
  $projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
  $buildJunction = Join-Path $env:TEMP "$Brand-android-release-$PID"
  Remove-BuildJunctionSafely $buildJunction
  New-Item -ItemType Junction -Path $buildJunction -Target $projectRoot | Out-Null
  Push-Location (Join-Path $buildJunction 'android')
  try {
    $taskName = 'assembleNukhabRelease'
    $bundleTaskName = 'bundleNukhabRelease'
    & .\gradlew.bat '-Duser.language=en' '-Duser.country=US' $taskName $bundleTaskName
    if ($LASTEXITCODE -ne 0) { throw "Android release build failed with exit code $LASTEXITCODE." }
  } finally {
    Pop-Location
    Remove-BuildJunctionSafely $buildJunction
  }
} finally {
  if ($passwordPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  }
  Remove-Variable plainPassword -ErrorAction SilentlyContinue
  Remove-Item Env:ANDROID_RELEASE_KEYSTORE_PATH -ErrorAction SilentlyContinue
  Remove-Item Env:ANDROID_RELEASE_KEYSTORE_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:ANDROID_RELEASE_KEY_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:ANDROID_RELEASE_KEY_ALIAS -ErrorAction SilentlyContinue
}
