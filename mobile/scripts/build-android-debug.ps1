param(
  [string]$NodeExecutable = 'node',
  [string]$AndroidSdkPath = (Join-Path $env:LOCALAPPDATA 'Android\Sdk'),
  [ValidatePattern('^[a-z0-9][a-z0-9._-]*\.apk$')]
  [string]$ArtifactName = 'nukhab-native-debug-x86_64.apk',
  [ValidatePattern('^[a-z0-9][a-z0-9._-]*\.json$')]
  [string]$ReportName = 'android-build-stage.json'
)

$ErrorActionPreference = 'Stop'
$taskMobile = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$taskRepo = (Resolve-Path -LiteralPath (Join-Path $taskMobile '..')).Path
$taskNode = (Get-Command -Name $NodeExecutable -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
$taskNodeVersion = (& $taskNode --version).Trim().TrimStart('v')
if ([version]$taskNodeVersion -lt [version]'24.19.0') {
  throw 'Windows native preparation requires Node 24.19.0 or newer. Supply -NodeExecutable when it is not in PATH.'
}
$taskSdk = (Resolve-Path -LiteralPath $AndroidSdkPath).Path
if (-not (Test-Path -LiteralPath (Join-Path $taskSdk 'platforms'))) { throw 'Android SDK platforms are missing.' }
$taskJava = (Get-Command -Name 'java' -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
$taskNpmCommand = (Get-Command -Name 'npm.cmd' -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
$taskNpmCli = Join-Path (Split-Path -Parent $taskNpmCommand) 'node_modules/npm/bin/npm-cli.js'
if (-not (Test-Path -LiteralPath $taskNpmCli)) { throw 'Could not locate npm CLI beside npm.cmd.' }
$taskProfile = (Resolve-Path -LiteralPath $env:USERPROFILE).Path
$taskStageBase = [IO.Path]::GetFullPath((Join-Path $taskProfile '.nb'))
if ([IO.Path]::GetDirectoryName($taskStageBase) -ne $taskProfile) { throw 'Build root is outside the intended profile directory.' }
$taskStageName = 's' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
$taskStage = [IO.Path]::GetFullPath((Join-Path $taskStageBase $taskStageName))
if ($taskStage -match '[^\x00-\x7F]') { throw 'Profile build-stage path must be ASCII.' }
if ([IO.Path]::GetDirectoryName($taskStage) -ne $taskStageBase -or -not $taskStage.StartsWith($taskStageBase + [IO.Path]::DirectorySeparatorChar)) {
  throw 'Build stage is outside its intended profile directory.'
}
$taskOutput = [IO.Path]::GetFullPath((Join-Path $taskMobile 'artifacts'))
if ([IO.Path]::GetDirectoryName($taskOutput) -ne $taskMobile) { throw 'Artifact directory is outside mobile.' }
foreach ($taskDirectory in @($taskStageBase, $taskOutput)) {
  if ((Test-Path -LiteralPath $taskDirectory) -and ((Get-Item -LiteralPath $taskDirectory).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'Build-stage or artifact directory must not be a link.'
  }
}
$taskOwnerFile = Join-Path $taskStageBase '.nukhab-build-owner.json'
if (Test-Path -LiteralPath $taskStageBase) {
  if (-not (Test-Path -LiteralPath $taskOwnerFile)) { throw 'Existing profile build root is not owned by this helper.' }
  $taskOwner = Get-Content -LiteralPath $taskOwnerFile -Raw | ConvertFrom-Json
  if ($taskOwner.owner -ne 'nukhab-native-build' -or $taskOwner.source -ne $taskRepo) {
    throw 'Existing profile build root belongs to another source.'
  }
} else {
  New-Item -ItemType Directory -Path $taskStageBase -ErrorAction Stop | Out-Null
  @{ owner = 'nukhab-native-build'; source = $taskRepo } | ConvertTo-Json |
    Set-Content -LiteralPath $taskOwnerFile -Encoding utf8
}
$taskCreated = $false
$taskPushed = $false
$taskFailure = $null
$taskArtifact = $null
$taskArtifactHash = $null
$taskPhase = 'prepare-stage'
$taskHashes = [Collections.Generic.List[object]]::new()
$taskOriginalPath = $env:PATH
$taskOriginalSdk = $env:ANDROID_HOME
$taskOriginalSdkRoot = $env:ANDROID_SDK_ROOT
$taskOriginalDotenv = $env:EXPO_NO_DOTENV
$taskOriginalNodeEnv = $env:NODE_ENV
$taskOriginalCi = $env:CI

try {
  New-Item -ItemType Directory -Path $taskStage -ErrorAction Stop | Out-Null
  $taskCreated = $true
  New-Item -ItemType Directory -Path $taskOutput -Force | Out-Null
  $taskFiles = [Collections.Generic.List[string]]::new()
  foreach ($taskName in @('App.tsx','index.ts','app.json','package.json','package-lock.json','tsconfig.json','metro.config.cjs','eslint.config.mjs','LICENSE')) {
    $taskFiles.Add('mobile/' + $taskName)
  }
  foreach ($taskFolder in @('mobile/src','mobile/assets','mobile/tests','shared/vendor/braces-safe')) {
    foreach ($taskFile in Get-ChildItem -LiteralPath (Join-Path $taskRepo $taskFolder) -File -Recurse) {
      if ($taskFile.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'A staged source file is a link.' }
      $taskFiles.Add($taskFile.FullName.Substring($taskRepo.Length + 1).Replace('\','/'))
    }
  }
  foreach ($taskSharedFile in @('shared/quranSelectionText.js','shared/registration-link.js','shared/dashboard-permissions.js',
    'shared/account-contact.js','shared/hijri-calendar.js','shared/business-date.js','shared/session-period.js',
    'shared/quran-execution-policy.js','shared/staff-attendance.js',
    'src/lib/numericInput.js','src/lib/juzRanges.js','src/lib/rosterSearch.js','src/lib/quranRangeText.js','src/lib/studentSessionResult.js')) {
    $taskFiles.Add($taskSharedFile)
  }
  foreach ($taskName in @('nukhab-app.png','nukhab-color.png','nukhab-white.png','icon-192.png')) {
    $taskFiles.Add('public/branding/nukhab/' + $taskName)
  }
  foreach ($taskWeight in @(400,700)) { $taskFiles.Add("public/fonts/cairo/cairo-${taskWeight}.ttf") }
  foreach ($taskPage in @(1,2,604)) {
    $taskFiles.Add("public/quran/hafs/pages/${taskPage}.json")
    $taskFiles.Add("public/quran/hafs/layout-v1/${taskPage}.json")
    $taskFiles.Add("public/quran/hafs/fonts/v1/p${taskPage}.woff2")
  }
  foreach ($taskRelative in $taskFiles | Select-Object -Unique) {
    if ($taskRelative -match '(^|/)(\.env(?:\.[^/]+)?|server|node_modules|data1\.yml)(/|$)') { throw 'Disallowed staged source path.' }
    $taskSource = [IO.Path]::GetFullPath((Join-Path $taskRepo $taskRelative))
    $taskDestination = [IO.Path]::GetFullPath((Join-Path $taskStage $taskRelative))
    if (-not $taskSource.StartsWith($taskRepo + [IO.Path]::DirectorySeparatorChar) -or -not $taskDestination.StartsWith($taskStage + [IO.Path]::DirectorySeparatorChar)) {
      throw 'Staged file path escaped the approved roots.'
    }
    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($taskDestination)) -Force | Out-Null
    $taskSourceHash = (Get-FileHash -LiteralPath $taskSource -Algorithm SHA256).Hash
    Copy-Item -LiteralPath $taskSource -Destination $taskDestination
    $taskCopyHash = (Get-FileHash -LiteralPath $taskDestination -Algorithm SHA256).Hash
    if ($taskCopyHash -ne $taskSourceHash) { throw 'Build-stage source checksum does not match.' }
    $taskHashes.Add([ordered]@{ path = $taskRelative; sourceSha256 = $taskSourceHash; stageSha256 = $taskCopyHash })
  }
  '{"private":true,"type":"module"}' | Set-Content -LiteralPath (Join-Path $taskStage 'package.json') -Encoding utf8
  Push-Location -LiteralPath (Join-Path $taskStage 'mobile')
  $taskPushed = $true
  $env:PATH = (Split-Path -Parent $taskNode) + ';' + $taskOriginalPath
  $env:ANDROID_HOME = $taskSdk
  $env:ANDROID_SDK_ROOT = $taskSdk
  $env:EXPO_NO_DOTENV = '1'
  $env:NODE_ENV = 'development'
  $env:CI = '1'
  $taskPhase = 'npm-ci'
  & $taskNode $taskNpmCli ci
  if ($LASTEXITCODE -ne 0) { throw 'Build-stage npm installation failed.' }
  $taskPhase = 'prebuild'
  & $taskNode 'node_modules/expo/bin/cli' prebuild --platform android --no-install --clean
  if ($LASTEXITCODE -ne 0) { throw 'Expo Android preparation failed.' }
  Set-Location -LiteralPath 'android'
  $taskPhase = 'assemble-debug'
  & $taskJava '-Dfile.encoding=UTF-8' '-Duser.language=en' '-Duser.country=US' `
    '-Dorg.gradle.project.kotlin.compiler.execution.strategy=in-process' `
    -classpath '.\gradle\wrapper\gradle-wrapper.jar' org.gradle.wrapper.GradleWrapperMain `
    :app:assembleDebug '-PreactNativeArchitectures=x86_64' `
    '-Pkotlin.compiler.execution.strategy=in-process' --no-daemon --max-workers=2
  if ($LASTEXITCODE -ne 0) { throw 'Android debug build failed; review the Gradle error above.' }
  $taskPhase = 'copy-artifact'
  $taskApk = Join-Path $taskStage 'mobile/android/app/build/outputs/apk/debug/app-debug.apk'
  if (-not (Test-Path -LiteralPath $taskApk) -or (Get-Item -LiteralPath $taskApk).Length -lt 1000000) {
    throw 'Gradle did not produce the expected debug APK.'
  }
  $taskArtifact = Join-Path $taskOutput $ArtifactName
  if ((Test-Path -LiteralPath $taskArtifact) -and ((Get-Item -LiteralPath $taskArtifact).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'APK artifact target must not be a link.'
  }
  $taskArtifactHash = (Get-FileHash -LiteralPath $taskApk -Algorithm SHA256).Hash
  Copy-Item -LiteralPath $taskApk -Destination $taskArtifact -Force
  if ((Get-FileHash -LiteralPath $taskArtifact -Algorithm SHA256).Hash -ne $taskArtifactHash) { throw 'APK copy checksum does not match.' }
  $taskPhase = 'completed'
} catch {
  $taskFailure = $_
} finally {
  if ($taskPushed) {
    try { Pop-Location } catch { Write-Warning 'Could not restore the original working directory.' }
  }
  $env:PATH = $taskOriginalPath
  $env:ANDROID_HOME = $taskOriginalSdk
  $env:ANDROID_SDK_ROOT = $taskOriginalSdkRoot
  $env:EXPO_NO_DOTENV = $taskOriginalDotenv
  $env:NODE_ENV = $taskOriginalNodeEnv
  $env:CI = $taskOriginalCi
  $taskCleaned = -not $taskCreated
  if ($taskCreated) {
    try {
      $taskResolved = (Resolve-Path -LiteralPath $taskStage).Path
      if ($taskResolved -ne $taskStage -or [IO.Path]::GetDirectoryName($taskResolved) -ne $taskStageBase `
        -or [IO.Path]::GetFileName($taskResolved) -ne $taskStageName `
        -or (Get-Item -LiteralPath $taskResolved).Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw 'Refused cleanup outside this build stage.'
      }
      Remove-Item -LiteralPath $taskResolved -Recurse -Force
      $taskCleaned = $true
    } catch {
      Write-Warning 'Build-stage cleanup failed. The original build failure, if any, is preserved.'
      if (-not $taskFailure) { $taskFailure = $_ }
    }
  }
  if (Test-Path -LiteralPath $taskOutput) {
    try {
      $taskBuildReport = Join-Path $taskOutput $ReportName
      if ((Test-Path -LiteralPath $taskBuildReport) -and ((Get-Item -LiteralPath $taskBuildReport).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'Build report target must not be a link.'
      }
      [ordered]@{ date = [DateTime]::UtcNow.ToString('o'); phase = $taskPhase; cleaned = $taskCleaned;
        stage = $taskStage; sourceFiles = $taskHashes; nativeNode = $taskNodeVersion;
        artifactSha256 = $taskArtifactHash; artifact = $taskArtifact;
        result = $(if ($taskFailure) { 'failed' } else { 'passed' }) } |
        ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $taskBuildReport -Encoding utf8
    } catch {
      Write-Warning 'Could not write the build-stage report. The original build failure, if any, is preserved.'
      if (-not $taskFailure) { $taskFailure = $_ }
    }
  }
}
if ($taskFailure) { throw $taskFailure }
