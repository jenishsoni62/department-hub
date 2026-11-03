@echo off
cd /d "%~dp0"
title Department Hub
echo.
echo  Department Hub v2
echo  ------------------
if not exist node_modules (
  echo  First time: installing... this takes about a minute.
  call npm install
  if errorlevel 1 (
    echo.
    echo  Install failed. Please send a photo/copy of the red text above.
    pause
    exit /b 1
  )
)
echo.
echo  Starting... when you see "Department Hub is running", open  http://localhost:3000
echo  Keep this window open. Close it to stop the website.
echo.
call npm start
echo.
pause
