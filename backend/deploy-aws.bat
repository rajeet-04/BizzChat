@echo off
REM AWS Deployment script for BizChat backend (Windows development only)
REM For AWS Linux server, use deploy-aws.sh

echo.
echo ============================================
echo BizChat Backend - AWS Deployment (Local Build)
echo ============================================
echo.

REM Navigate to backend
cd /d "%~dp0"

REM Kill existing PM2 processes
echo [*] Stopping any existing processes...
call pm2 kill

REM Install dependencies
echo [*] Installing dependencies...
call pnpm install

REM Build
echo [*] Building backend...
call pnpm run build

REM Create logs directory
if not exist logs mkdir logs

REM Start with PM2
echo [*] Starting with PM2...
call pm2 start dist/index.js --name bizchat-backend --max-memory-restart 512M
call pm2 save
REM Note: sudo pm2 startup is Linux-only, skip on Windows

REM Verify
echo.
echo ============================================
echo [+] Deployment complete!
echo ============================================
echo.
echo Status:
call pm2 status
echo.
echo Last 10 log lines:
call pm2 logs --lines 10
echo.
echo Testing health endpoint:
timeout /t 1
curl http://localhost:3000/api/health
echo.
echo [+] Backend is running on http://localhost:3000
echo [+] On AWS: http://52.66.154.194:3000
echo.
pause
