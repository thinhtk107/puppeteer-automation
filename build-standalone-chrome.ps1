# Build Standalone Executable for Puppeteer Automation WITH CHROME
# This script packages the entire application including Node.js runtime, Chrome browser and all dependencies

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Building Standalone Application (WITH CHROME)" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

$ErrorActionPreference = "Stop"

# 1. Clean previous builds
Write-Host "`n[1/9] Cleaning previous builds..." -ForegroundColor Yellow
if (Test-Path ".\standalone-app") {
    Remove-Item -Recurse -Force ".\standalone-app"
}
New-Item -ItemType Directory -Path ".\standalone-app" | Out-Null

# 2. Install dependencies if needed
Write-Host "`n[2/9] Ensuring dependencies are installed..." -ForegroundColor Yellow
if (-not (Test-Path ".\node_modules")) {
    Write-Host "Installing npm dependencies..." -ForegroundColor Yellow
    npm install --include=optional
}

# 3. Copy application files
Write-Host "`n[3/9] Copying application files..." -ForegroundColor Yellow
$filesToCopy = @(
    "server.js",
    "package.json",
    ".env",
    "eng.traineddata"
)

foreach ($file in $filesToCopy) {
    if (Test-Path $file) {
        Copy-Item $file ".\standalone-app\" -Force
        Write-Host "  - Copied $file" -ForegroundColor Green
    }
}

# Copy directories
$dirsToRopy = @(
    "public",
    "src",
    "logs",
    "uploads",
    "tools"
)

foreach ($dir in $dirsToRopy) {
    if (Test-Path $dir) {
        Copy-Item $dir ".\standalone-app\" -Recurse -Force
        Write-Host "  - Copied $dir\" -ForegroundColor Green
    }
}

# 4. Copy node_modules (essential dependencies)
Write-Host "`n[4/9] Copying node_modules..." -ForegroundColor Yellow
Copy-Item ".\node_modules" ".\standalone-app\node_modules" -Recurse -Force
Write-Host "  - Copied node_modules" -ForegroundColor Green

# 5. Download and bundle Node.js runtime
Write-Host "`n[5/9] Downloading Node.js portable..." -ForegroundColor Yellow
$nodeVersion = "v20.11.0"
$nodeUrl = "https://nodejs.org/dist/$nodeVersion/node-$nodeVersion-win-x64.zip"
$nodeZip = ".\standalone-app\node-portable.zip"

try {
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeZip
    Write-Host "  - Downloaded Node.js $nodeVersion" -ForegroundColor Green
    
    # Extract Node.js
    Expand-Archive -Path $nodeZip -DestinationPath ".\standalone-app\nodejs-temp" -Force
    
    # Move to root level
    $extractedFolder = Get-ChildItem ".\standalone-app\nodejs-temp" | Select-Object -First 1
    Move-Item ".\standalone-app\nodejs-temp\$($extractedFolder.Name)\*" ".\standalone-app\nodejs\" -Force
    
    # Cleanup
    Remove-Item ".\standalone-app\nodejs-temp" -Recurse -Force
    Remove-Item $nodeZip -Force
    
    Write-Host "  - Extracted Node.js runtime" -ForegroundColor Green
} catch {
    Write-Host "  Warning: Failed to download Node.js: $_" -ForegroundColor Red
    Write-Host "  Using system Node.js instead" -ForegroundColor Yellow
}

# 6. Download Chrome for Windows (PORTABLE)
Write-Host "`n[6/9] Downloading Chrome browser..." -ForegroundColor Yellow
$chromeFolder = ".\standalone-app\chrome"
New-Item -ItemType Directory -Path $chromeFolder -Force | Out-Null

try {
    # Use Puppeteer to download Chrome
    Write-Host "  Installing Chrome via Puppeteer..." -ForegroundColor Yellow
    
    # Create temporary script to download Chrome
    $downloadChromeScript = @'
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  try {
    const browser = await puppeteer.launch({ headless: true });
    const chromePath = browser.process().spawnfile;
    await browser.close();
    
    console.log('Chrome path:', chromePath);
    
    const chromeDir = path.dirname(chromePath);
    console.log('Chrome directory:', chromeDir);
    
    fs.writeFileSync('./chrome-path.txt', chromeDir, 'utf8');
    
    console.log('SUCCESS: Chrome path saved');
  } catch (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
  }
})();
'@
    
    Set-Content -Path ".\download-chrome.js" -Value $downloadChromeScript -Encoding UTF8
    
    # Run the script
    node .\download-chrome.js
    
    if (Test-Path ".\chrome-path.txt") {
        $chromeCacheDir = Get-Content ".\chrome-path.txt" -Raw
        $chromeCacheDir = $chromeCacheDir.Trim()
        
        Write-Host "  Chrome cache directory: $chromeCacheDir" -ForegroundColor Cyan
        
        # Copy Chrome to standalone folder
        if (Test-Path $chromeCacheDir) {
            Copy-Item "$chromeCacheDir\*" $chromeFolder -Recurse -Force
            Write-Host "  - Copied Chrome browser to standalone folder" -ForegroundColor Green
        } else {
            Write-Host "  Warning: Chrome directory not found: $chromeCacheDir" -ForegroundColor Yellow
        }
        
        # Cleanup
        Remove-Item ".\chrome-path.txt" -Force
        Remove-Item ".\download-chrome.js" -Force
    }
    
} catch {
    Write-Host "  Warning: Failed to download Chrome: $_" -ForegroundColor Red
    Write-Host "  Application will try to use system Chrome" -ForegroundColor Yellow
}

# 7. Create startup script
Write-Host "`n[7/9] Creating startup scripts..." -ForegroundColor Yellow

$startupBatContent = @'
@echo off
echo ========================================
echo Puppeteer Automation Standalone App
echo ========================================
echo.
echo Starting server...
echo.

REM KHÔNG set PUPPETEER_EXECUTABLE_PATH - Để automation.js tự động tìm
REM Chrome sẽ được tự động detect: chrome-headless-shell.exe hoặc chrome.exe

REM Use bundled Node.js if available, otherwise use system Node.js
if exist nodejs\node.exe (
    echo Using bundled Node.js runtime
    echo Using bundled Chrome browser
    nodejs\node.exe server.js
) else (
    echo Using system Node.js runtime
    node server.js
)

echo.
echo Server stopped.
pause
'@

Set-Content -Path ".\standalone-app\START.bat" -Value $startupBatContent -Encoding ASCII
Write-Host "  - Created START.bat" -ForegroundColor Green

# 8. Create README
Write-Host "`n[8/9] Creating README..." -ForegroundColor Yellow

$readmeContent = @"
# Puppeteer Automation - Standalone Application (WITH CHROME)

## System Requirements
- Windows 10/11 (64-bit)
- RAM: 4GB or more
- Storage: ~500MB (including Chrome browser)

## How to Use

### Start Application
1. Open this folder
2. Run **START.bat**
3. Browser will open at: http://localhost:3000

### Configuration
- Config file: **.env**
- Change port, API keys, etc. in this file

### Stop Application
- Close Command Prompt window
- Or press Ctrl+C

### Logs
- Logs saved in: **logs/**
- Screenshots/uploads in: **uploads/**

## IMPORTANT
- This app includes Chrome browser
- NO need to install Chrome on your system
- Chrome is bundled in **chrome/** folder

## Troubleshooting

### Error "Port 3000 already in use"
1. Close application running on port 3000
2. Or change PORT in .env file

### Error "Cannot find module"
- Ensure **node_modules** folder is intact
- Do not delete/move files

### Error "Could not find Chrome"
- Check **chrome/** folder is intact
- Ensure **chrome/chrome.exe** exists

### Connection Error
- Check internet connection
- Check firewall/antivirus

## Folder Structure
``````
standalone-app/
+-- START.bat           # Startup file
+-- server.js           # Main server
+-- package.json        # Dependencies
+-- .env                # Configuration
+-- nodejs/             # Node.js runtime
+-- chrome/             # Chrome browser (bundled)
+-- node_modules/       # Libraries
+-- public/             # Web UI
+-- src/                # Source code
+-- logs/               # Logs
+-- uploads/            # Temp files
+-- tools/              # Tools
``````

## Information
- Version: 1.0.0
- Build date: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
- Node.js: $nodeVersion (bundled)
- Chrome: Included (portable)

## Support
- GitHub: https://github.com/thinhtk107/puppeteer-automation
"@

Set-Content -Path ".\standalone-app\README.txt" -Value $readmeContent -Encoding UTF8
Write-Host "  - Created README.txt" -ForegroundColor Green

# 9. Create ZIP package
Write-Host "`n[9/9] Creating ZIP package..." -ForegroundColor Yellow

$zipName = "puppeteer-automation-standalone-$(Get-Date -Format 'yyyyMMdd-HHmmss').zip"

try {
    Compress-Archive -Path ".\standalone-app\*" -DestinationPath ".\$zipName" -Force
    Write-Host "  - Created $zipName" -ForegroundColor Green
} catch {
    Write-Host "  Warning: Failed to create ZIP: $_" -ForegroundColor Red
}

# Summary
Write-Host "`n=====================================" -ForegroundColor Cyan
Write-Host "Build Complete!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Standalone folder: .\standalone-app\" -ForegroundColor Yellow
Write-Host "ZIP package: .\$zipName" -ForegroundColor Yellow
Write-Host ""
Write-Host "To test:" -ForegroundColor Cyan
Write-Host "  cd standalone-app" -ForegroundColor White
Write-Host "  .\START.bat" -ForegroundColor White
Write-Host ""
Write-Host "To distribute:" -ForegroundColor Cyan
Write-Host "  Share the ZIP file: $zipName" -ForegroundColor White
Write-Host ""

# Calculate size
$folderSize = (Get-ChildItem -Path ".\standalone-app" -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host "Package size: $([math]::Round($folderSize, 2)) MB" -ForegroundColor Yellow

Write-Host "`nDone! Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
