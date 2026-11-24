# Independent official Toss Securities OAuth test. Prints only status, never credentials.
# PowerShell 7; run on same Windows machine as personal Toss server.
$ErrorActionPreference = 'Stop'
$path = 'C:\Jungho\private\toss.env'
$id = $null
$secret = $null
$requestBody = $null
try {
  if (-not (Test-Path -LiteralPath $path)) { Write-Host '설정 파일이 없습니다'; exit 2 }
  $all = @(Get-Content -LiteralPath $path)
  $ids = @($all | Where-Object { $_ -match '^TOSS_CLIENT_ID=' })
  $secrets = @($all | Where-Object { $_ -match '^TOSS_CLIENT_SECRET=' })
  if ($ids.Count -ne 1 -or $secrets.Count -ne 1) { Write-Host 'ID 또는 Secret 항목이 없거나 중복되었습니다'; exit 2 }
  $id = $ids[0].Substring('TOSS_CLIENT_ID='.Length)
  $secret = $secrets[0].Substring('TOSS_CLIENT_SECRET='.Length)
  if ([string]::IsNullOrWhiteSpace($id) -or [string]::IsNullOrWhiteSpace($secret) -or
      $id.Contains('여기에') -or $secret.Contains('여기에')) {
    Write-Host '인증정보에 빈 값 또는 예시 문구가 있습니다'; exit 2
  }
  if ($id -cne $id.Trim() -or $secret -cne $secret.Trim()) {
    Write-Host '인증값 앞이나 뒤에 공백이 있습니다'; exit 2
  }
  if ($id.StartsWith('"') -and $id.EndsWith('"')) { $id=$id.Substring(1,$id.Length-2) }
  if ($secret.StartsWith('"') -and $secret.EndsWith('"')) { $secret=$secret.Substring(1,$secret.Length-2) }
  $requestBody = @{grant_type='client_credentials';client_id=$id;client_secret=$secret}
  Write-Host '토스 공식 인증 서버에 직접 요청합니다. 인증값은 표시하지 않습니다.'
  $result = Invoke-WebRequest -Uri 'https://openapi.tossinvest.com/oauth2/token' -Method Post -ContentType 'application/x-www-form-urlencoded' -Body $requestBody -SkipHttpErrorCheck -TimeoutSec 25
  $status = [int]$result.StatusCode
  Write-Host ('공식 인증 HTTP 결과: '+$status)
  switch ($status) {
    200 { Write-Host '공식 인증 성공: Windows 조회 서버가 사용한 설정 또는 재시작 상태를 확인하세요' }
    400 { Write-Host '공식 요청 형식 오류: 인증 값 또는 API 사양 점검' }
    401 { Write-Host '공식 서버도 인증 거부: WTS Client ID/Secret 쌍과 활성화 상태 점검' }
    403 { Write-Host '공식 서버가 IP 거부: WTS 허용 IP 등록 확인' }
    429 { Write-Host '공식 인증 요청 제한: 반복 시도하지 마세요' }
    default { Write-Host '토스 API 또는 인터넷 연결 상태 확인 필요' }
  }
  if ($status -eq 401 -or $status -eq 400 -or $status -eq 403) {
    try {
      $errorData = $result.Content | ConvertFrom-Json
      $e = [string]$errorData.error
      if (@('invalid_client','invalid_request','access_denied','unsupported_grant_type').Contains($e)) {
        Write-Host ('공식 OAuth 오류 종류: '+$e)
      }
      # Print ONLY a known field name. Never echo the raw provider error_description,
      # which may contain sensitive data in future API versions.
      $desc = [string]$errorData.error_description
      if ($desc -match 'client_secret') {
        Write-Host '검증 실패 위치: Client Secret'
      } elseif ($desc -match 'client_id') {
        Write-Host '검증 실패 위치: Client ID'
      } elseif ($e -eq 'invalid_client') {
        Write-Host '검증 실패 위치: 불명확 (ID/Secret 발급 쌍과 활성 상태 확인)'
      }
    } catch {}
  }
} catch {
  Write-Host '진단 실행 오류: Windows PowerShell 7 및 공식 API 연결 상태를 확인하세요'
} finally {
  $id=$null
  $secret=$null
  $requestBody=$null
  $result=$null
}
