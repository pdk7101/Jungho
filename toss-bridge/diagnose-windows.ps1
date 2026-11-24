# Windows PowerShell 7 diagnostic for the locally running read-only Toss gateway.
# Does not display tokens, broker secrets, account numbers, or account values.
# Run: pwsh -NoProfile -File "C:\Jungho\app\diagnose-windows.ps1"
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$envPath = "C:\Jungho\private\toss.env"
$serverUri = "http://127.0.0.1:8788/api/toss/holdings"
if (-not (Test-Path -LiteralPath $envPath)) {
    Write-Host "설정 파일 없음: C:\Jungho\private\toss.env"
    exit 2
}
$entries = @(Get-Content -LiteralPath $envPath -ErrorAction Stop | Where-Object { $_.StartsWith("TOSS_VIEW_TOKEN=") })
if ($entries.Count -ne 1) {
    Write-Host "TOSS_VIEW_TOKEN 설정이 없거나 중복되었습니다."
    exit 2
}
$token = $entries[0].Substring("TOSS_VIEW_TOKEN=".Length).Trim()
if ($token.Length -lt 32) {
    Write-Host "개인 조회 암호가 32자 미만입니다. 설정 파일을 확인하세요."
    exit 2
}
$headers = @{
    Origin = "https://pdk7101.github.io"
    Authorization = "Bearer $token"
    Accept = "application/json"
}
try {
    $response = Invoke-WebRequest -Uri $serverUri -Method Get -Headers $headers -TimeoutSec 35 -SkipHttpErrorCheck
    $status = [int]$response.StatusCode
    Write-Host ("로컬 서버 HTTP 결과: " + $status)
    try {
        $body = $response.Content | ConvertFrom-Json -ErrorAction Stop
    }
    catch {
        Write-Host "서버 응답이 JSON 형식이 아닙니다. 서버 버전을 확인하세요."
        exit 1
    }
    if ($status -eq 200 -and $body.ok -eq $true) {
        Write-Host "토스증권 계좌 조회 성공" -ForegroundColor Green
        Write-Host "종목 상세와 계좌 금액은 보안상 출력하지 않습니다."
    }
    else {
        if ($null -ne $body.stage -and [string]$body.stage -ne "") {
            Write-Host ("실패 단계: " + [string]$body.stage)
        }
        else {
            Write-Host "실패 단계 표시 없음: 서버 코드를 최신 버전으로 교체해야 합니다."
        }
        if ($null -ne $body.upstreamStatus) {
            Write-Host ("토스 API 응답 코드: " + [string]$body.upstreamStatus)
        }
        if ($null -ne $body.error) {
            Write-Host ("안내: " + [string]$body.error)
        }
        Write-Host "위의 HTTP 결과, 실패 단계, 토스 API 응답 코드만 공유하세요."
        exit 1
    }
}
catch {
    Write-Host "Windows 로컬 서버 통신 실패: 127.0.0.1:8788 연결 및 서버 실행 상태를 확인하세요."
    Write-Host "첫 PowerShell 창의 서버가 실행 중인지 확인하세요."
    exit 1
}
finally {
    $token = $null
    $headers = $null
    $entries = $null
}
