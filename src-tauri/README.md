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

## Verified (macOS, this machine: one display)
Panel boots; output + feed windows open/close with events; relay auth + fan-out; Bible import (first-run) + search; clipboard; background media; library, song and overlay test scripts pass; packaged `.app` (45 MB) serves its bundled resources.
Native Save and Open dialogs appear (a Save-argument bug was found and fixed); Reveal in Finder works. Choosing a file in the dialogs and writing it was not clicked through.
Memory, 3 Bibles loaded, release build: about 546 MB (Electron was 630-734 MB).

## Still needs a real machine
- **Windows (WebView2) and Linux (WebKitGTK):** cannot be built from macOS (the SQLite C build needs each platform's toolchain). `.github/workflows/desktop.yml` builds and tests all three on CI; run it and try the installers. Windows uses `http://sp.localhost` for the panel origin (Tauri's mapping of `sp://`).
- **Second monitor and OBS:** output goes to a non-primary screen by default; pick one in Outputs. Check transparency and OBS Window/Display Capture on a real second screen.
- **Signing and notarization:** the .app is only ad-hoc signed. Add the `APPLE_*` secrets listed in the workflow (needs an Apple Developer ID certificate) and Windows signing. Without it macOS shows an "unidentified developer" warning.
- Your Electron data does not carry over (origin changed from `file://` to `sp://`): Export Backup in the old app, Import Backup here.
