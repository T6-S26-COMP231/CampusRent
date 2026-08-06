<#
.SYNOPSIS
  CampusRent GitHub task-time tracker.

.DESCRIPTION
  Tracks active (non-paused) work time against a GitHub issue and posts Actual Hours
  when stopped. Local state is stored in .task-time-tracker.json (gitignored).

.EXAMPLE
  .\scripts\track-task.ps1 start 117
  .\scripts\track-task.ps1 pause
  .\scripts\track-task.ps1 resume
  .\scripts\track-task.ps1 status
  .\scripts\track-task.ps1 stop
  .\scripts\track-task.ps1 stop -DryRun
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0, Mandatory = $true)]
  [ValidateSet('start', 'pause', 'resume', 'status', 'stop')]
  [string]$Command,

  [Parameter(Position = 1)]
  [int]$IssueNumber,

  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$TrackerPath = Join-Path $RepoRoot '.task-time-tracker.json'
$HistoryPath = Join-Path $RepoRoot '.task-time-history.json'
$Repo = 'T6-S26-COMP231/CampusRent'
$Contributor = 'Ramika Dinan'

function Assert-GhAvailable {
  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw 'GitHub CLI (gh) was not found on PATH. Install it from https://cli.github.com/ and try again.'
  }
}

function Assert-GhAuthenticated {
  Assert-GhAvailable
  try {
    $null = & gh auth status 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw 'not authenticated'
    }
  }
  catch {
    throw 'GitHub CLI is not authenticated. Run: gh auth login'
  }
}

function Read-Tracker {
  if (-not (Test-Path -LiteralPath $TrackerPath)) {
    return $null
  }

  try {
    return Get-Content -LiteralPath $TrackerPath -Raw | ConvertFrom-Json
  }
  catch {
    throw "Could not read tracker file at $TrackerPath. Fix or delete the file and try again."
  }
}

function Write-Tracker {
  param([Parameter(Mandatory = $true)]$State)

  $json = $State | ConvertTo-Json -Depth 6
  Set-Content -LiteralPath $TrackerPath -Value $json -Encoding UTF8
}

function Clear-Tracker {
  if (Test-Path -LiteralPath $TrackerPath) {
    Remove-Item -LiteralPath $TrackerPath -Force
  }
}

function Get-NowIso {
  return (Get-Date).ToString('o')
}

function ConvertFrom-Iso {
  param([Parameter(Mandatory = $true)][string]$Value)
  return [datetime]::Parse($Value, $null, [System.Globalization.DateTimeStyles]::RoundtripKind)
}

function Get-ActiveSeconds {
  param([Parameter(Mandatory = $true)]$State)

  $accumulated = [int64]$State.accumulatedActiveSeconds
  if ($State.status -eq 'running' -and $State.segmentStartedAt) {
    $segmentStart = ConvertFrom-Iso -Value ([string]$State.segmentStartedAt)
    $elapsed = [math]::Max(0, [int64]([datetime]::Now - $segmentStart).TotalSeconds)
    return $accumulated + $elapsed
  }

  return $accumulated
}

function Format-Minutes {
  param([Parameter(Mandatory = $true)][int64]$Seconds)
  return [math]::Floor($Seconds / 60)
}

function Format-DecimalHours {
  param([Parameter(Mandatory = $true)][int64]$Seconds)
  return [math]::Round(($Seconds / 3600.0), 2)
}

function Get-IssueTitle {
  param([Parameter(Mandatory = $true)][int]$Number)

  Assert-GhAuthenticated

  $title = & gh issue view $Number --repo $Repo --json title --jq '.title' 2>&1
  if ($LASTEXITCODE -ne 0) {
    $message = ($title | Out-String).Trim()
    if ($message -match 'Could not resolve to an issue|Not Found|HTTP 404') {
      throw "Invalid or missing GitHub issue #$Number in $Repo."
    }
    throw "Failed to load GitHub issue #$Number. $message"
  }

  $clean = ([string]$title).Trim()
  if ([string]::IsNullOrWhiteSpace($clean)) {
    throw "GitHub issue #$Number returned an empty title."
  }

  return $clean
}

function Build-CommentBody {
  param(
    [Parameter(Mandatory = $true)][double]$Hours,
    [Parameter(Mandatory = $true)][int64]$Minutes
  )

  $hoursText = '{0:N2}' -f $Hours
  return @"
Actual Hours: $hoursText hours
Active Time: $Minutes minutes

Work completed:
- Completed and reviewed the requirements for this task.
- Verified the implementation and related test results.

Contributor: $Contributor
Tracked using the CampusRent task timer.
"@
}

function Show-Status {
  param([Parameter(Mandatory = $true)]$State)

  $activeSeconds = Get-ActiveSeconds -State $State
  $minutes = Format-Minutes -Seconds $activeSeconds
  $hours = Format-DecimalHours -Seconds $activeSeconds

  Write-Host ''
  Write-Host 'CampusRent task timer'
  Write-Host ('Issue: #{0}' -f $State.issueNumber)
  Write-Host ('Title: {0}' -f $State.issueTitle)
  Write-Host ('Status: {0}' -f $State.status)
  Write-Host ('Started: {0}' -f $State.startedAt)
  Write-Host ('Active elapsed: {0} minutes' -f $minutes)
  Write-Host ('Decimal hours: {0:N2}' -f $hours)
  Write-Host ''
}

function Invoke-Start {
  param([Parameter(Mandatory = $true)][int]$Number)

  if ($Number -le 0) {
    throw 'Start requires a positive GitHub issue number. Example: .\scripts\track-task.ps1 start 117'
  }

  $existing = Read-Tracker
  if ($existing -and ($existing.status -eq 'running' -or $existing.status -eq 'paused')) {
    throw ("A timer is already active for #{0} ({1}). Pause/stop it before starting another task." -f `
      $existing.issueNumber, $existing.issueTitle)
  }

  $title = Get-IssueTitle -Number $Number
  $now = Get-NowIso

  $state = [pscustomobject]@{
    issueNumber              = $Number
    issueTitle               = $title
    startedAt                = $now
    segmentStartedAt         = $now
    accumulatedActiveSeconds = 0
    status                   = 'running'
    repo                     = $Repo
  }

  Write-Tracker -State $state
  Write-Host ("Started tracking #{0}: {1}" -f $Number, $title)
  Show-Status -State $state
}

function Invoke-Pause {
  $state = Read-Tracker
  if (-not $state) {
    throw 'No active task timer to pause.'
  }
  if ($state.status -ne 'running') {
    throw ("Timer for #{0} is not running (status: {1})." -f $state.issueNumber, $state.status)
  }

  $activeSeconds = Get-ActiveSeconds -State $state
  $state.accumulatedActiveSeconds = $activeSeconds
  $state.segmentStartedAt = $null
  $state.status = 'paused'
  Write-Tracker -State $state

  Write-Host ("Paused tracking #{0}." -f $state.issueNumber)
  Show-Status -State $state
}

function Invoke-Resume {
  $state = Read-Tracker
  if (-not $state) {
    throw 'No paused task timer to resume.'
  }
  if ($state.status -ne 'paused') {
    throw ("Timer for #{0} is not paused (status: {1})." -f $state.issueNumber, $state.status)
  }

  $state.segmentStartedAt = Get-NowIso
  $state.status = 'running'
  Write-Tracker -State $state

  Write-Host ("Resumed tracking #{0}." -f $state.issueNumber)
  Show-Status -State $state
}

function Invoke-Status {
  $state = Read-Tracker
  if (-not $state) {
    Write-Host 'No active CampusRent task timer.'
    return
  }

  Show-Status -State $state
}

function Append-History {
  param([Parameter(Mandatory = $true)]$Entry)

  $history = @()
  if (Test-Path -LiteralPath $HistoryPath) {
    try {
      $existing = Get-Content -LiteralPath $HistoryPath -Raw | ConvertFrom-Json
      if ($existing -is [System.Array]) {
        $history = @($existing)
      }
      elseif ($null -ne $existing) {
        $history = @($existing)
      }
    }
    catch {
      Write-Warning "Could not parse existing history file; creating a new history entry list."
      $history = @()
    }
  }

  $history += $Entry
  $history | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $HistoryPath -Encoding UTF8
}

function Invoke-Stop {
  $state = Read-Tracker
  if (-not $state) {
    throw 'No task timer is running or paused. Nothing to stop.'
  }

  if ($state.status -notin @('running', 'paused')) {
    throw ("Cannot stop timer for #{0} with unexpected status '{1}'." -f $state.issueNumber, $state.status)
  }

  # Include the final running segment; paused timers already stored accumulated time only.
  $activeSeconds = Get-ActiveSeconds -State $state
  $minutes = Format-Minutes -Seconds $activeSeconds
  $hours = Format-DecimalHours -Seconds $activeSeconds
  $commentBody = Build-CommentBody -Hours $hours -Minutes $minutes
  $issueUrl = "https://github.com/$Repo/issues/$($state.issueNumber)"

  Write-Host ''
  Write-Host ("Ready to stop tracking #{0}: {1}" -f $state.issueNumber, $state.issueTitle)
  Write-Host ("Active time: {0} minutes ({1:N2} hours)" -f $minutes, $hours)
  Write-Host ''
  Write-Host 'Comment that will be posted:'
  Write-Host '----------------------------------------'
  Write-Host $commentBody
  Write-Host '----------------------------------------'

  if ($DryRun) {
    Write-Host 'DryRun enabled: comment was NOT posted and the timer was NOT cleared.'
    return
  }

  $confirmation = Read-Host 'Post this comment to GitHub and clear the timer? (y/N)'
  if ($confirmation -notmatch '^(y|yes)$') {
    Write-Host 'Stop cancelled. Timer left unchanged.'
    return
  }

  Assert-GhAuthenticated

  $commentOutput = & gh issue comment $state.issueNumber --repo $Repo --body $commentBody 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw ("Failed to post GitHub comment for #{0}. {1}" -f $state.issueNumber, (($commentOutput | Out-String).Trim()))
  }

  $historyEntry = [pscustomobject]@{
    issueNumber              = $state.issueNumber
    issueTitle               = $state.issueTitle
    startedAt                = $state.startedAt
    stoppedAt                = Get-NowIso
    accumulatedActiveSeconds = $activeSeconds
    activeMinutes            = $minutes
    decimalHours             = $hours
    commentPosted            = $true
    issueUrl                 = $issueUrl
  }
  Append-History -Entry $historyEntry
  Clear-Tracker

  Write-Host ''
  Write-Host 'Actual Hours comment posted successfully.'
  Write-Host ("Issue: {0}" -f $issueUrl)
  Write-Host ("Archived locally to {0}" -f $HistoryPath)
  Write-Host 'Active timer cleared.'
}

try {
  switch ($Command) {
    'start' {
      if (-not $PSBoundParameters.ContainsKey('IssueNumber') -or $IssueNumber -le 0) {
        throw 'Start requires a GitHub issue number. Example: .\scripts\track-task.ps1 start 117'
      }
      Invoke-Start -Number $IssueNumber
    }
    'pause' { Invoke-Pause }
    'resume' { Invoke-Resume }
    'status' { Invoke-Status }
    'stop' { Invoke-Stop }
  }
}
catch {
  Write-Error $_.Exception.Message
  exit 1
}
