# Scripture Pod on Tauri

Electron has been removed; this is the only desktop app.

Run in development: `npm run tauri:dev` (needs Rust, https://rustup.rs). Build a bundle: `npm run tauri:build` (needs `cargo install tauri-cli --version "^2"`).

## How it maps from Electron
| Electron | Tauri |
|---|---|
| Electron `main.js` HTTP server | `src/server.rs` (OBS/remote display, background media with Range, port fallback 5510+) |
| `ws` relay + token | `src/relay.rs` (same token rule, constant-time compare, port fallback 5511+) |
| Bible search worker (`node:sqlite`) | `src/search.rs` (rusqlite, FTS5 trigram) |
| `preload.js` / `ipcMain` | `src/shim.js` + `src/api.rs` (`/__bsp/<name>` calls) |
| Output / Feed `BrowserWindow`s | `src/windows.rs` (transparent, frameless, per-monitor) |
| `loadFile` panel | `sp://` custom protocol, so the data origin never depends on a free port |

The HTTP server only serves `src/`, `assets/bg`, `assets/logo`, `build/` and the QR script (not the whole project folder).

## Dev harness
`SP_SCRIPT=<file.js> cargo run` (or a release build with `--features harness`) runs a script in the panel and prints its result.

## Verified (macOS)
Panel boots; output + feed windows open/close with events; relay auth + fan-out; Bible import (first-run) + search; clipboard; background media; library, song and overlay test scripts pass; packaged `.app` (45 MB) serves its bundled resources.
Memory, 3 Bibles loaded, release build: about 546 MB (Electron 630-734 MB).

## Not yet verified / to do
- Your existing Electron data (IndexedDB) does not carry over: the origin changed from `file://` to `sp://`. Use Export Backup in the Electron app, then Import Backup here.
- Windows (WebView2), Linux (WebKitGTK), code signing/notarization, auto-update.
- External-screen placement and transparent output on a real second monitor, and OBS capture of the output window.
- Backup dialogs and reveal-in-folder (written, not exercised).
