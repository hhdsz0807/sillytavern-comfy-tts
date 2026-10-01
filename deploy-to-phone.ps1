# 一键将 sillytavern-comfy-tts 部署到手机端的 SillyTavern 第三方扩展目录
$ErrorActionPreference = "Stop"

$AdbPath = "C:\Users\admin\Downloads\platform-tools-latest-windows\platform-tools\adb.exe"
if (-not (Test-Path $AdbPath)) {
    $AdbPath = "adb"
}

Write-Host ">>> 正在检测 ADB 连接设备..."
$devices = & $AdbPath devices
Write-Host $devices

$targetDir = "/data/user/0/com.dsh.client.plus/files/linux/ubuntu/root/SillyTavern/public/scripts/extensions/third-party/sillytavern-comfy-tts"
$localDir = $PSScriptRoot

Write-Host ">>> 正在创建手机端扩展目录: $targetDir"
& $AdbPath shell "run-as com.dsh.client.plus mkdir -p $targetDir"

Write-Host ">>> 正在推送插件文件到临时目录 /data/local/tmp/..."
& $AdbPath push "$localDir\manifest.json" /data/local/tmp/sct_manifest.json
& $AdbPath push "$localDir\index.js" /data/local/tmp/sct_index.js
& $AdbPath push "$localDir\style.css" /data/local/tmp/sct_style.css
& $AdbPath push "$localDir\README.md" /data/local/tmp/sct_README.md

Write-Host ">>> 正在复制到应用私有酒馆扩展目录并赋权..."
& $AdbPath shell "run-as com.dsh.client.plus cp /data/local/tmp/sct_manifest.json $targetDir/manifest.json"
& $AdbPath shell "run-as com.dsh.client.plus cp /data/local/tmp/sct_index.js $targetDir/index.js"
& $AdbPath shell "run-as com.dsh.client.plus cp /data/local/tmp/sct_style.css $targetDir/style.css"
& $AdbPath shell "run-as com.dsh.client.plus cp /data/local/tmp/sct_README.md $targetDir/README.md"
& $AdbPath shell "run-as com.dsh.client.plus chmod -R 755 $targetDir"

Write-Host ">>> 部署完成！请在手机浏览器或酒馆界面刷新页面即可体验。" -ForegroundColor Green
