@echo off
REM Sync local wiki/ with GitHub Wiki
REM Usage: scripts\sync-wiki.bat [pull|push]

setlocal enabledelayedexpansion

cd /d "%~dp0.."

if /i "%1"=="pull" (
    echo Pulling wiki from GitHub...
    git -C wiki pull --rebase
    echo Done.
    goto :eof
)

if /i "%1"=="push" (
    echo Checking for changes...
    git -C wiki add -A
    git -C wiki diff --cached --quiet
    if errorlevel 1 (
        git -C wiki commit -m "Update wiki"
        git -C wiki push
        echo Pushed.
    ) else (
        echo No changes to push.
    )
    goto :eof
)

if /i "%1"=="" (
    echo Syncing wiki...
    git -C wiki pull --rebase
    git -C wiki add -A
    git -C wiki diff --cached --quiet
    if errorlevel 1 (
        git -C wiki commit -m "Update wiki"
        git -C wiki push
        echo Done.
    ) else (
        echo Already up to date.
    )
    goto :eof
)

echo Usage: sync-wiki.bat [pull^|push]
exit /b 1
