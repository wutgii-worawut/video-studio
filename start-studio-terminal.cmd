@echo off
setlocal
cd /d "%~dp0"
echo Starting Video Studio with the optional, full-access PowerShell terminal...
echo.
echo The access code will appear below. Enter it in the PowerShell tab in Studio.
echo Do not share this code or expose this server to other computers.
echo.
call npm run studio:terminal
echo.
echo Studio has stopped. Press any key to close this launcher.
pause > nul
