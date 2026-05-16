param(
  [Parameter(Mandatory = $true)]
  [string]$Authtoken,

  [string]$NatappPath = ".\tools\natapp\natapp.exe",

  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$ResolvedNatappPath = Join-Path $Root $NatappPath

function Test-PortListening {
  param([int]$LocalPort)

  $connection = Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue
  return [bool]$connection
}

if (-not (Test-Path -LiteralPath $ResolvedNatappPath)) {
  Write-Host "未找到 NATAPP 客户端：" -ForegroundColor Yellow
  Write-Host $ResolvedNatappPath
  Write-Host ""
  Write-Host "请从 NATAPP 官网下载 Windows 客户端，解压后放到 tools\natapp\natapp.exe。"
  Write-Host "下载地址：https://natapp.cn/download"
  exit 1
}

if (-not (Test-PortListening -LocalPort $Port)) {
  Write-Host "本地 $Port 端口未运行，正在启动 Next.js..."
  Start-Process -FilePath "npm.cmd" `
    -ArgumentList @("run", "dev", "--", "--hostname", "127.0.0.1", "--port", "$Port") `
    -WorkingDirectory $Root `
    -WindowStyle Hidden

  Start-Sleep -Seconds 4
}

if (-not (Test-PortListening -LocalPort $Port)) {
  Write-Host "Next.js 未能监听 $Port 端口，请先手动运行 npm run dev。" -ForegroundColor Red
  exit 1
}

Write-Host "本地服务已就绪：http://127.0.0.1:$Port" -ForegroundColor Green
Write-Host "正在启动 NATAPP。看到 Forwarding 地址后，把该地址发给同学即可。"
Write-Host ""

& $ResolvedNatappPath -authtoken="$Authtoken"
