# Scripture Pod

This repository contains the control Panel and Display for Scripture Pod (a Bible / lyrics projection tool). It can be run in-browser or as an Electron desktop app.

## Requirements

- Node.js (v18+ recommended)
- npm (bundled with Node)
- Optional: Electron build tools if packaging an app (`electron-builder`)

## Quick start (development)

1. Install dependencies:

```bash
cd "$(dirname "$0")"
npm install
```

2. Run the Electron desktop app (launches the panel and display in windows):

```bash
npm start
```

## Run in a browser (panel + display)

You can open the following files directly in a modern browser for quick testing (not packaged):

- `src/renderer/panel/panel.html` — control panel UI
- `src/renderer/display/display.html` — output/display window

Notes:

- For full functionality (Electron APIs, local filesystem access, packaging), run via `npm start`.
- When using browser-only mode, some features (native menus, file dialogs, electron-specific modules) will be unavailable.

## Display on another computer

The Electron app can serve the display over the local network. Both computers must be on the same reachable network, and the control computer must remain running.

1. Start the desktop app with `npm start` or open the installed app.
2. In the control panel, open **Settings → Host Mode** and select **WebSocket Relay**. This relays panel updates to a remote display, such as an OBS Browser Source on the streaming computer.
3. In the same settings section, use **LAN Display URL**. Click **Refresh** after changing networks, then **Copy**.
4. Open the copied URL in a browser on the other computer.

The app also prints the current display URL to the terminal after its local HTTP and WebSocket servers start. The URL uses the control computer's current LAN IP, so it can change when that computer joins another network. Allow inbound TCP ports `5510` (display page) and `5511` (update relay) through the control computer's firewall. Do not expose these ports directly to the public internet.

Generated display and RemoteShow links contain a per-launch relay access token. Treat them like passwords: share them only with intended displays, and refresh copied links after restarting the desktop app. RemoteShow QR codes are generated locally and do not send the link to an external QR service.

This is a browser-based network display, not an NDI output stream. Both computers need browser access to the host computer; an NDI receiver will not discover this URL as an NDI source.

## Building installers (macOS/Windows/Linux)

Install dev dependencies (already in `package.json`) and run the appropriate script. Example (mac):

```bash
npm install
npm run dist:mac
```

The `build` section in `package.json` is configured for `electron-builder`.

## Android and iOS

The Capacitor mobile apps reuse the control panel and connect to a desktop host over the local WebSocket relay. Keep the phone/tablet and desktop on the same trusted Wi-Fi network; do not expose the relay ports to the public internet. Desktop-only features such as selecting a separate physical output display remain available only in the desktop app.

Build and open the Android project with Android Studio:

```bash
npm install
npm run mobile:android
```

Build and open the iOS project with Xcode on macOS:

```bash
npm install
npm run mobile:ios
```

Each command stages the shared panel assets and synchronizes the native project before opening the IDE. Android builds require Android Studio and its SDK; iOS builds require the full Xcode installation and signing configuration.

On macOS, choose the target architecture explicitly when needed:

```bash
npm run dist:mac -- --arm64
npm run dist:mac -- --x64
```

Build Windows installers with:

```bash
npm run dist:win
```

The default Windows package targets x64 so builds made on Apple Silicon or Linux
are usable on standard 64-bit Windows PCs.

Build Linux packages with:

```bash
npm run dist:linux
```

For reliable releases, build each target on its corresponding operating system.
macOS release builds use an available Developer ID signing identity; without
signing and notarization credentials, downloaded apps may be blocked by
Gatekeeper.

## Installation instructions

### Windows

1. Build the installer from a Windows machine:

```powershell
npm install
npm run dist:win
```

2. Open the generated file in the `dist/` folder.
3. Install the app using the `.exe` installer or run the portable `.exe` version if you do not want a full install.
4. If Windows Defender or SmartScreen shows a warning, click **More info** and then **Run anyway**.
5. Launch the app normally from the Start menu or desktop shortcut.

Notes:

- The NSIS installer creates a standard Windows app install.
- The portable build can be copied to another machine without a formal installation.

### Linux

1. Build the package on Linux:

```bash
npm install
npm run dist:linux
```

2. Open the generated files in the `dist/` folder.
3. For an AppImage:
   - Mark it executable if needed:

```bash
chmod +x "dist/Scripture Pod-*.AppImage"
```

- Run the AppImage directly.

4. If using the Linux zip archive:
   - Extract the archive.
   - Run the contained executable from the extracted folder, or move it into your applications directory.

Notes:

- AppImage is the easiest option for most Linux users.
- If the system blocks execution, enable the app to run as a program or install the package from your distro's software center if you created a package format.

## Project layout

```
src/
  main/          Electron main process: main.js, preload.js, relay-security.js,
                 bundled-bibles.js, bible-search.js (+ worker, SQLite search index)
  renderer/
    panel/       The control panel
      panel.html
      styles/    base.css, modern.css, console.css (loaded in that order)
      scripts/   Classic scripts, loaded in order by panel.html, grouped by role:
        core/          state and storage, app core, settings, i18n and theme, startup
        library/       Bible and lyrics library, chapter grid, Bible search
        ui/            workspace, sidebar, shortcuts, command palette
        output/        live output, sync, program display, recording and streaming
        sources/       scenes, sources, FX, media and backgrounds
        integrations/  host mode, translation, remote display tools
    display/     The output page (display.html, display.css)
    fonts/       Bundled fonts (Geist, Geist Mono, Source Serif 4) shared by both pages
  shared/        Code used by both pages (lower-third-extra.js)
assets/          bibles/ (bundled Bible XML), logo/, bg/
build/           App icons and the logo used by the panel (electron-builder buildResources)
scripts/         Build and maintenance scripts (mobile build, icon render)
test/            Node test runner tests (`npm test`)
android/ ios/    Capacitor native projects
```

The display page is served at `/src/renderer/display/display.html`. The old
`/UI/scripture-pod-display.html` address redirects there, so saved OBS browser
sources keep working. Set `SCRIPTURE_POD_HTTP_PORT` and `SCRIPTURE_POD_RELAY_PORT`
to run a second copy beside a running one.

## Troubleshooting

- If `npm install` fails, ensure Node version is compatible and your environment can compile native modules.
- If Electron windows do not appear when running `npm start`, check the terminal for errors and ensure no other instance is locking required ports.
- If the remote display does not load, confirm both computers are on the same network, refresh the LAN URL, and allow TCP ports `5510` and `5511` through the host firewall.

## Contributing

Fork, make changes, and submit a pull request. Keep changes focused and include short tests or manual verification steps.
