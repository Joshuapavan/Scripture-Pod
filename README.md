# Scripture Pod

Scripture Pod is a Bible and lyrics projection tool for churches. A control panel
sends verses, lyrics and lower thirds to an output window or to OBS. It is a
desktop app built with [Tauri](https://tauri.app) (Rust plus the system web view).
macOS, Windows and Linux are supported; the app is not built for Android or iOS.

## Requirements

- [Rust](https://rustup.rs) (stable)
- Node.js 18 or newer and npm
- To package installers: the Tauri CLI, `cargo install tauri-cli --version "^2" --locked`
- Linux only: `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libxdo-dev`

## Run it

```bash
npm install
npm start
```

`npm start` runs the app from the project folder, so edits to `src/` show after a reload.

On first launch, choose the bundled Bibles in the setup dialog (English NKJV, Kannada and
Tamil BSI). They are imported once and stored on the computer.

You can also open `src/renderer/panel/panel.html` in a browser for quick UI work. Native
features (output windows, file dialogs, the display server) are unavailable there.

## Build an installer

```bash
npm run tauri:build
```

Installers are written to `src-tauri/target/release/bundle/` (`.app` and `.dmg` on macOS,
`.exe` on Windows, `.deb` and `.AppImage` on Linux). Build each system on that system.
The same builds run in GitHub Actions (`.github/workflows/push-release.yml`).

macOS apps are unsigned (no Apple Developer ID), so macOS shows an "unidentified developer"
warning on first open: right-click the app and choose Open. On Windows, SmartScreen may warn:
choose More info, then Run anyway.

CI builds on every push to `main` and uploads the installers to the run (Actions, open the run,
Artifacts, kept 14 days). Nothing is published as a release unless you push a `v*` tag or run
the workflow by hand with "publish" ticked.

## Output and OBS

- **Output window:** Outputs, then pick a screen. It is a transparent, frameless window
  that you capture in OBS with Window Capture or Display Capture.
- **Stream feed:** a second, opaque output for a capture card, filled with a key colour
  (black for Luma Key, green for Chroma Key).
- **Browser source:** the app serves the display page on your network. In OBS add a Browser
  Source with the URL from **Settings, Host Mode, LAN Display URL**.

### Display on another computer

1. In **Settings, Host Mode**, choose **WebSocket Relay**.
2. Copy the **LAN Display URL** and open it on the other computer, or paste it into an OBS
   Browser Source.

The app prints the URL at startup. It uses this computer's LAN address, so it changes when you
join another network. Allow TCP ports `5510` (display page) and `5511` (relay) through the
firewall, and never expose them to the internet. If a port is busy the app uses the next free
one (set `SCRIPTURE_POD_HTTP_PORT` and `SCRIPTURE_POD_RELAY_PORT` to choose your own).

Links contain a per-launch access token. Treat them like passwords and re-copy them after a
restart. RemoteShow QR codes are generated on the computer and never sent to a QR service.
This is a browser display, not an NDI stream.

## Backup and restore

Use **Export Backup** and **Import Backup** in Settings (Import Backup is also on the
first-run screen). One JSON file holds:

- all songs, with translations
- every imported Bible version (the bundled ones too)
- the schedule and presets
- every setting: Look defaults, fonts, backgrounds (including uploaded images and videos), lower
  third styles and colours, host and output settings
- saved names, pinned and recent references, panel sizes, language and theme

Restoring replaces what is on this computer, asks first, and restarts the panel so everything
loads from the restored data. The Bible search index is rebuilt on the next start.

To move to a new computer or a fresh install: export on the old one, install, then choose
Import Backup on the first-run screen. The backup is verified end to end on a clean install
(songs, all three Bibles, schedule, presets, settings, saved names and layout come back
identical, and Bible search works again after the rebuild).

Not in the backup: the live display address and access token (new each launch), the
pairing code (regenerated), and window positions.

## Project layout

```
src/
  renderer/
    panel/       The control panel
      panel.html
      styles/    base.css, modern.css, console.css (loaded in that order)
      scripts/   Classic scripts loaded in order by panel.html, grouped by role:
        core/          state and storage, app core, settings, i18n and theme, startup
        library/       Bible and lyrics library, chapter grid, Bible search
        ui/            workspace, sidebar, shortcuts, command palette, app chrome
        output/        live output, sync, embedded Program/Preview displays
        sources/       media and backgrounds
        integrations/  host mode, translation, remote display tools
    display/     The output page (display.html, display.css), used by every output
    fonts/       Bundled fonts (Geist, Geist Mono, Source Serif 4)
  shared/        Code used by both pages: lower-third-extra.js (name designs),
                 social-overlay.js (social engagement lower third)
src-tauri/       The desktop app (Rust): servers, relay, Bible search, windows
assets/          bibles/ (bundled Bible XML), logo/, bg/
build/           App icon source and logo
test/            Node tests (`npm test` also runs the Rust tests)
.github/         CI: tests, installers, releases
```

See `src-tauri/README.md` for how the Rust side maps to the pages and what has been verified.

The display page is served at `/src/renderer/display/display.html`. The old
`/UI/scripture-pod-display.html` address redirects there, so saved OBS browser sources keep working.

## Tests

```bash
npm test
```

Runs the Node tests (lower-third designs, social overlay) and the Rust tests (relay token,
file serving rules, Bible search).

## Troubleshooting

- `cargo: command not found`: run `source "$HOME/.cargo/env"` or open a new terminal.
- The app window does not appear: run `npm start` and read the terminal for errors.
- Another copy holds the ports: the app moves to the next free ports, so the OBS URL changes.
  Quit the other copy to keep the same URL.
- The remote display does not load: both computers must be on the same network; re-copy the
  LAN URL and allow TCP `5510` and `5511` through the firewall.

## Contributing

Fork, make changes, and open a pull request. Keep changes focused and include short tests or
manual verification steps.
