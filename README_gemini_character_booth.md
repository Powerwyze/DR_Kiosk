# Camera Capture Service

This repo runs a browser kiosk for Royal Wine and saves photos locally.

## Required files
- `caricature_server.py` (capture API)
- `public/camera.html` (camera flow)
- `public/scripts/camera.js` (camera + capture logic)
- `kiosk-launcher.bat` (launches Chrome in kiosk mode)

## Environment
Create `.env` at the project root and set:

```text
CARICATURE_PORT=5001
CARICATURE_SAVE_DIR=C:\Users\Aarons\OneDrive\caricutures
```

## Run locally

1. Serve the kiosk files:
   ```bash
   python -m http.server 5500
   ```

2. Start the capture service:
   ```bash
   python caricature_server.py
   ```

3. Open camera page in browser:
   - `http://127.0.0.1:5500/public/camera.html`

Captured images are posted to:
`http://127.0.0.1:5001/save-capture`

The original image is saved as:
`[email].jpg` (or fallback capture id name)

After saving, the UI calls `GET /caricature-result` with the job id and shows the generated caricature when ready.

## Chrome kiosk mode

Use `kiosk-launcher.bat` to start Chrome in fullscreen kiosk mode with the app.

### Manual launch

1. Double-click `kiosk-launcher.bat`, or run from PowerShell:
   ```powershell
   .\kiosk-launcher.bat
   ```

This script:
- starts a local HTTP server on port `5500`
- launches Chrome with kiosk UI flags
- opens:
  `http://127.0.0.1:5500/index.html`

### Kiosk command reference

```text
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk "http://127.0.0.1:5500/index.html" --incognito --no-first-run --disable-pinch --overscroll-history-navigation=0 --autoplay-policy=no-user-gesture-required
```

If Chrome is installed elsewhere, edit `CHROME_EXE` in `kiosk-launcher.bat`.

## Auto-start on Windows login

To start the capture service automatically for kiosk users:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\enable-capture-autostart.ps1
```

To disable:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\disable-capture-autostart.ps1
```

## Notes
- Do not use `git add` on `.env` with API keys/paths for production.
- Keep kiosk assets local for reliable startup without internet dependency.
