# ============================================================================
# deploy-to-hostinger.ps1
# Purpose: creates the GitHub Actions workflow for auto-deploy to Hostinger:
#          .github/workflows/deploy.yml
# Usage:   1) Put this file in the project root (next to package.json)
#          2) Run:  powershell -ExecutionPolicy Bypass -File .\deploy-to-hostinger.ps1
# Note:    The workflow YAML is stored base64-encoded so this script is
#          immune to any text-encoding problems. Do not edit it.
# ============================================================================

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }

Write-Host ("=" * 50)
Write-Host " Deploy to Hostinger - setup deploy.yml"
Write-Host ("=" * 50)
Write-Host " Project folder: $root"

$workflowDir = Join-Path $root '.github\workflows'
$target      = Join-Path $workflowDir 'deploy.yml'

# Workflow YAML content (base64 of the exact production workflow)
$b64 = 'bmFtZTog8J+agCDZhti02LEg2KfZhNil2YbYqtin2Kwg2KXZhNmJINmH2YjYs9iq2YbYrNixCgojINis2LPYsSDYqtmE2YLYp9im2Yo6INmD2YQg2YXYsdipINiq2Y/YsdmB2Y7YuSDZg9mI2YXZitiqINi52YTZiSDYp9mE2YHYsdi5IHBvcnQtMDAxMzQKIyDihpIg2YrZj9io2YbZjtmJIFJlYWN0INil2YTZiSDZhdmE2YHYp9iqINir2KfYqNiq2KkgKGRpc3QvKSDihpIg2KrZj9ix2YHZjti5INiq2YTZgtin2KbZitin2Ysg2KXZhNmJINmH2YjYs9iq2YbYrNixINi52KjYsSBGVFAKIyDihpIg2YrYuNmH2LEg2KfZhNiq2LnYr9mK2YQg2LnZhNmJIGphemlyYXQtYWxha2FyaW0uY29tINiu2YTYp9mEINiv2YLZitmC2KkuCiMg2YrZhdmD2YYg2KrYtNi62YrZhNmHINmK2K/ZiNmK2KfZiyDYo9mK2LbYp9mLINmF2YYg2KrYqNmI2YrYqCBBY3Rpb25zIOKGkiAiRGVwbG95IHRvIEhvc3RpbmdlciIuCgpvbjoKICBwdXNoOgogICAgYnJhbmNoZXM6IFtwb3J0LTAwMTM0XQogIHdvcmtmbG93X2Rpc3BhdGNoOgoKY29uY3VycmVuY3k6CiAgZ3JvdXA6IGRlcGxveS1wcm9kdWN0aW9uLSR7eyBnaXRodWIucmVmIH19CiAgY2FuY2VsLWluLXByb2dyZXNzOiB0cnVlCgpqb2JzOgogIGJ1aWxkLWFuZC1kZXBsb3k6CiAgICBuYW1lOiDYqNmG2KfYoSDYq9mFINmG2LTYsQogICAgcnVucy1vbjogdWJ1bnR1LWxhdGVzdAogICAgc3RlcHM6CiAgICAgIC0gbmFtZTog8J+TpSDYp9iz2KrZhNin2YUg2KfZhNmD2YjYrwogICAgICAgIHVzZXM6IGFjdGlvbnMvY2hlY2tvdXRAdjQKCiAgICAgIC0gbmFtZTog8J+foiDYpdi52K/Yp9ivIE5vZGUuanMKICAgICAgICB1c2VzOiBhY3Rpb25zL3NldHVwLW5vZGVAdjQKICAgICAgICB3aXRoOgogICAgICAgICAgbm9kZS12ZXJzaW9uLWZpbGU6IC5udm1yYwogICAgICAgICAgY2FjaGU6IG5wbQoKICAgICAgLSBuYW1lOiDwn5OmINiq2KvYqNmK2Kog2KfZhNin2LnYqtmF2KfYr9mK2KfYqgogICAgICAgIHJ1bjogbnBtIGNpCgogICAgICAtIG5hbWU6IPCflKgg2KjZhtin2KEg2KfZhNmF2YjZgti5ICjZitit2YjZkdmEINmD2YjYryBSZWFjdCDYpdmE2Ykg2YXZhNmB2KfYqiDYq9in2KjYqtipINmB2YogZGlzdC8pCiAgICAgICAgcnVuOiBucG0gcnVuIGJ1aWxkCiAgICAgICAgZW52OgogICAgICAgICAgVklURV9TVVBBQkFTRV9VUkw6ICR7eyBzZWNyZXRzLlZJVEVfU1VQQUJBU0VfVVJMIH19CiAgICAgICAgICBWSVRFX1NVUEFCQVNFX0FOT05fS0VZOiAke3sgc2VjcmV0cy5WSVRFX1NVUEFCQVNFX0FOT05fS0VZIH19CiAgICAgICAgICBWSVRFX0FQUF9FTlY6IHByb2R1Y3Rpb24KCiAgICAgIC0gbmFtZTog8J+TpCDYsdmB2LkgZGlzdC8g2KXZhNmJINmH2YjYs9iq2YbYrNixIChGVFApCiAgICAgICAgdXNlczogU2FtS2lya2xhbmQvRlRQLURlcGxveS1BY3Rpb25AdjQuNC4wCiAgICAgICAgd2l0aDoKICAgICAgICAgIHNlcnZlcjogJHt7IHNlY3JldHMuRlRQX1NFUlZFUiB9fQogICAgICAgICAgdXNlcm5hbWU6ICR7eyBzZWNyZXRzLkZUUF9VU0VSTkFNRSB9fQogICAgICAgICAgcGFzc3dvcmQ6ICR7eyBzZWNyZXRzLkZUUF9QQVNTV09SRCB9fQogICAgICAgICAgcG9ydDogMjEKICAgICAgICAgIGxvY2FsLWRpcjogLi9kaXN0LwogICAgICAgICAgc2VydmVyLWRpcjogLwogICAgICAgICAgIyDZhNinINmG2YXYs9itINin2YTYrNiw2LEg2KrZhNmC2KfYptmK2KfZiyAo2YrYrdiq2YjZiiDZhdis2YTYr9in2Kog2KfZhNmG2LjYp9mFOiDYp9mE2KjYsdmK2K8v2KfZhNiz2KzZhNin2KopIOKAlCDYp9mE2YXZhNmBINin2YTZgtiv2YrZhSDZitmP2LPYqtio2K/ZhCDYqNmG2YHYsyDYp9mE2KfYs9mFCiAgICAgICAgICBkYW5nZXJvdXMtY2xlYW4tc2xhdGU6IGZhbHNlCiAgICAgICAgICBsb2ctbGV2ZWw6IHN0YW5kYXJkCgogICAgICAtIG5hbWU6IOKchSDYp9mE2KrYrdmC2YIg2KfZhNit2YogKNmF2LnZhNmI2YXYp9iq2Yog2YHZgti3IOKAlCDZhNinINmK2KTYq9ixINi52YTZiSDZhtis2KfYrSDYp9mE2YbYtNixKQogICAgICAgIGlmOiBzdWNjZXNzKCkKICAgICAgICBjb250aW51ZS1vbi1lcnJvcjogdHJ1ZQogICAgICAgIHJ1bjogfAogICAgICAgICAgY3VybCAtc0wgaHR0cHM6Ly9qYXppcmF0LWFsYWthcmltLmNvbS8gLW8gL3RtcC9pbmRleC5odG1sIHx8IHRydWUKICAgICAgICAgIGVjaG8gIuKAlCDZhtiq2YrYrNipINin2YTYqtit2YLZgiDZhdmGINin2YTYtdmB2K3YqSDigJQiCiAgICAgICAgICBncmVwIC1vICc8dGl0bGU+W148XSo8L3RpdGxlPicgL3RtcC9pbmRleC5odG1sIHx8IGVjaG8gIijYp9mE2LXZgdit2Kkg2YTZhSDYqtmP2K3ZhdmR2YQg2KjYudivIOKAlCDYp9mG2KrYuNixINiv2YLZitmC2Kkg2YjYqtij2YPYryDZgdmKINin2YTZhdiq2LXZgditKSIK'
$yaml = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64))

# 1) Create the internal folders if missing
New-Item -ItemType Directory -Force -Path $workflowDir | Out-Null

# 2) Write the file as UTF-8 without BOM (so GitHub reads it cleanly)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($target, $yaml, $utf8NoBom)

# 3) Verify the write
if (Test-Path $target) {
    $size  = (Get-Item $target).Length
    $check = [IO.File]::ReadAllText($target)
    Write-Host " Written: $target ($size bytes)"
    if ($check.Contains('name:') -and $check.Contains('FTP-Deploy-Action') -and $check.Contains('port-00134')) {
        Write-Host " Check: OK - file is complete and correct." -ForegroundColor Green
    } else {
        Write-Host " Check: content missing - re-run the script." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host " ERROR: file was not written." -ForegroundColor Red
    exit 1
}

# 4) If inside a git repo, show status of the new path
if (Test-Path (Join-Path $root '.git')) {
    Write-Host " Git status for the new path:"
    git -C $root status --short .github
} else {
    Write-Host " Note: this folder has no .git - make sure you are in the project folder."
}

Write-Host "--------------------------------------------------"
Write-Host " Next steps:"
Write-Host " 1. git add -A"
Write-Host " 2. git commit -m fix: توجيه النشر إلى مجلد الجذر الحقيقي"
Write-Host " 3. git push"
Write-Host "--------------------------------------------------"
