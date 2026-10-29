use sp_core::state::*;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, Monitor, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

const SHIM: &str = include_str!("shim.js");

// The panel and the output pages are served by the sp:// protocol so their origin
// (and the IndexedDB data behind it) never depends on a free TCP port.
pub fn origin() -> &'static str { if cfg!(windows) { "http://sp.localhost" } else { "sp://localhost" } }

fn page_url(page: &str, query: &str) -> WebviewUrl {
    WebviewUrl::External(format!("{}/{}{}", origin(), page, query).parse().unwrap())
}

fn builder<'a>(app: &'a AppHandle, label: &str, url: WebviewUrl) -> WebviewWindowBuilder<'a, tauri::Wry, AppHandle> {
    WebviewWindowBuilder::new(app, label, url).initialization_script(&format!("window.__BSP_LABEL={:?};\n{}", label, SHIM))
}

fn monitor_id(m: &Monitor, i: usize) -> String { let _ = m; i.to_string() }

fn is_internal(m: &Monitor) -> bool {
    m.name().map(|n| { let n = n.to_lowercase(); n.contains("built-in") || n.contains("color lcd") || n.contains("liquid retina") || n.contains("internal") }).unwrap_or(false)
}

pub fn displays(app: &AppHandle) -> Value {
    let primary = app.primary_monitor().ok().flatten();
    let list = app.available_monitors().unwrap_or_default();
    json!(list.iter().enumerate().map(|(i, m)| {
        let s = m.scale_factor();
        let is_primary = primary.as_ref().map(|p| p.position() == m.position() && p.size() == m.size()).unwrap_or(i == 0);
        json!({
            "id": monitor_id(m, i), "label": m.name().cloned().unwrap_or_else(|| format!("Display {}", i + 1)),
            "width": (m.size().width as f64 / s).round(), "height": (m.size().height as f64 / s).round(),
            "x": (m.position().x as f64 / s).round(), "y": (m.position().y as f64 / s).round(),
            "isPrimary": is_primary, "isInternal": is_internal(m)
        })
    }).collect::<Vec<_>>())
}

// Logical bounds (x, y, w, h) of the chosen screen; default is the first external one
fn bounds(app: &AppHandle, display_id: Option<&str>) -> (f64, f64, f64, f64) {
    let list = app.available_monitors().unwrap_or_default();
    let pick = display_id.and_then(|id| id.parse::<usize>().ok()).and_then(|i| list.get(i))
        .or_else(|| { // not the primary screen (it holds the panel), else any external one
            let primary = app.primary_monitor().ok().flatten();
            list.iter().find(|m| !is_internal(m) && primary.as_ref().map(|p| p.position() != m.position()).unwrap_or(true))
                .or_else(|| list.iter().find(|m| !is_internal(m) && list.len() > 1))
        })
        .cloned().or_else(|| app.primary_monitor().ok().flatten());
    match pick {
        Some(m) => { let s = m.scale_factor(); (m.position().x as f64 / s, m.position().y as f64 / s, m.size().width as f64 / s, m.size().height as f64 / s) }
        None => (0.0, 0.0, 1280.0, 720.0),
    }
}

fn display_id(opts: &Value) -> Option<String> {
    match &opts["displayId"] { Value::String(s) if !s.is_empty() => Some(s.clone()), Value::Number(n) => Some(n.to_string()), _ => None }
}

pub fn eval(w: &WebviewWindow, js: &str) { let _ = w.eval(js); }

pub fn emit_main(app: &AppHandle, event: &str) {
    if let Some(w) = app.get_webview_window("main") { eval(&w, &format!("window.__bspEmit&&window.__bspEmit({:?})", event)); }
}

// target: "output" (the monitor window), "feed" (the stream feed window), anything else = both
pub fn post_to_outputs(app: &AppHandle, message: &Value, target: Option<&str>) -> bool {
    let js = format!("window.postMessage({}, '*')", message);
    let mut any = false;
    for label in ["output", "feed", "stage"] {
        if let Some(t) = target { if (t == "output" || t == "feed" || t == "stage") && t != label { continue; } }
        if let Some(w) = app.get_webview_window(label) { eval(&w, &js); any = true; }
    }
    any
}

// The Displays view as its own window: it can be dragged to, or opened on, another monitor
pub fn open_displays(app: &AppHandle, opts: &Value) {
    let on_screen = display_id(opts);
    if let Some(win) = app.get_webview_window("displays") {
        if on_screen.is_some() { let (x, y, _, _) = bounds(app, on_screen.as_deref()); let _ = win.set_position(tauri::LogicalPosition::new(x + 40.0, y + 40.0)); }
        let _ = win.show();
        let _ = win.set_focus();
        return;
    }
    let mut b = builder(app, "displays", page_url("src/renderer/displays/displays.html", ""))
        .title("Scripture Pod displays").inner_size(640.0, 760.0).min_inner_size(360.0, 360.0).resizable(true).focused(true);
    if on_screen.is_some() { let (x, y, _, _) = bounds(app, on_screen.as_deref()); b = b.position(x + 40.0, y + 40.0); }
    let _ = b.build();
}

// A message from the panel into the Displays window
pub fn post_to_displays(app: &AppHandle, message: &Value) -> bool {
    match app.get_webview_window("displays") {
        Some(w) => { eval(&w, &format!("window.postMessage({}, '*')", message)); true }
        None => false,
    }
}

// An action from the Displays window to the panel
pub fn displays_action(app: &AppHandle, action: &Value) {
    if let Some(w) = app.get_webview_window("main") { eval(&w, &format!("window.__spDisplaysAction&&window.__spDisplaysAction({})", action)); }
}

pub fn close(app: &AppHandle, label: &str, silent: bool) {
    if let Some(w) = app.get_webview_window(label) {
        if silent { let _ = app.state::<std::sync::Arc<SilentClose>>().0.lock().map(|mut s| s.push(label.to_string())); }
        let _ = w.close();
    }
}

#[derive(Default)]
pub struct SilentClose(pub std::sync::Mutex<Vec<String>>);

fn watch_closed(app: &AppHandle, w: &WebviewWindow, label: &'static str) {
    let app = app.clone();
    w.on_window_event(move |e| {
        if let WindowEvent::Destroyed = e {
            let silent = app.state::<std::sync::Arc<SilentClose>>().0.lock().map(|mut s| { let had = s.contains(&label.to_string()); s.retain(|x| x != label); had }).unwrap_or(false);
            if !silent { emit_main(&app, if label == "output" { "output-closed" } else { "feed-closed" }); }
        }
    });
}

pub fn open_output(app: &AppHandle, opts: &Value) {
    let (x, y, w, h) = bounds(app, display_id(opts).as_deref());
    let fullscreen = opts["fullscreen"].as_bool().unwrap_or(false) || opts["requestFullscreen"].as_bool().unwrap_or(false);
    if let Some(win) = app.get_webview_window("output") {
        // A full screen window stays on its screen until it leaves full screen, so moving it starts there
        let _ = win.set_fullscreen(false);
        let _ = win.set_position(tauri::LogicalPosition::new(x, y));
        let _ = win.set_size(tauri::LogicalSize::new(w, h));
        if fullscreen { let _ = win.set_fullscreen(true); }
        let _ = win.set_focus();
        return;
    }
    let built = builder(app, "output", page_url(DISPLAY_PAGE, "?standalone=1&hostMode=standalone"))
        .decorations(false).transparent(true).position(x, y).inner_size(w, h).fullscreen(fullscreen).focused(true).build();
    if let Ok(win) = built { watch_closed(app, &win, "output"); }
}

// Another computer asked this one to show its display: a full screen window on this computer's screen
pub fn open_remote(app: &AppHandle, url: &str) {
    close(app, "remote", true);
    let Ok(parsed) = url.parse() else { return };
    let (x, y, w, h) = bounds(app, None);
    let built = WebviewWindowBuilder::new(app, "remote", WebviewUrl::External(parsed))
        .title("Scripture Pod display").decorations(false).position(x, y).inner_size(w, h).fullscreen(true).focused(true).build();
    if let Ok(win) = built { watch_closed(app, &win, "remote"); }
}

// "Identify screens": a small window with the screen's number on every screen for a few seconds
pub fn identify_screens(app: &AppHandle) -> usize {
    let list = app.available_monitors().unwrap_or_default();
    let primary = app.primary_monitor().ok().flatten();
    let mut labels: Vec<String> = Vec::new();
    for (i, m) in list.iter().enumerate() {
        let s = m.scale_factor();
        let (mw, mh) = (m.size().width as f64 / s, m.size().height as f64 / s);
        let (mx, my) = (m.position().x as f64 / s, m.position().y as f64 / s);
        let (w, h) = (420.0, 300.0);
        let label = format!("identify-{}", i);
        if let Some(old) = app.get_webview_window(&label) { let _ = old.close(); }
        let is_main = primary.as_ref().map(|p| p.position() == m.position() && p.size() == m.size()).unwrap_or(i == 0);
        let name = m.name().cloned().unwrap_or_default().replace(['&', '#', '?', '+'], " ").replace(' ', "%20");
        let query = format!("?n={}&label={}&main={}", i + 1, name, if is_main { 1 } else { 0 });
        let built = WebviewWindowBuilder::new(app, &label, page_url("src/renderer/display/identify.html", &query))
            .title("Screen").decorations(false).always_on_top(true).resizable(false)
            .position(mx + (mw - w) / 2.0, my + (mh - h) / 2.0).inner_size(w, h).focused(false).build();
        if built.is_ok() { labels.push(label); }
    }
    let n = labels.len();
    let app2 = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(3));
        for l in labels { if let Some(w) = app2.get_webview_window(&l) { let _ = w.close(); } }
    });
    n
}

// Stage display for the worship team: an ordinary full-screen window on the chosen screen
pub fn open_stage(app: &AppHandle, opts: &Value) {
    close(app, "stage", true);
    let (x, y, w, h) = bounds(app, display_id(opts).as_deref());
    let built = builder(app, "stage", page_url(DISPLAY_PAGE, "?standalone=1&hostMode=standalone&role=stage"))
        .title("Scripture Pod stage").decorations(false).position(x, y).inner_size(w, h).fullscreen(true).focused(true).build();
    if let Ok(win) = built { watch_closed(app, &win, "stage"); }
}

// The background wall: a full screen window that only plays the chosen video, looping and silent
pub fn open_wall(app: &AppHandle, opts: &Value) {
    close(app, "wall", true);
    let (x, y, w, h) = bounds(app, display_id(opts).as_deref());
    let fit = if opts["fit"].as_str() == Some("contain") { "contain" } else { "cover" };
    // One address, or several separated by commas (a playlist)
    let list = opts["urls"].as_array().map(|a| a.iter().filter_map(|u| u.as_str()).collect::<Vec<_>>().join(",")).unwrap_or_else(|| opts["url"].as_str().unwrap_or("").to_string());
    let src: String = list.chars().filter(|c| c.is_ascii_alphanumeric() || ":/._-,%".contains(*c)).collect();
    let fade = opts["fade"].as_f64().unwrap_or(0.0).clamp(0.0, 5.0);
    let kind = if opts["kind"].as_str() == Some("html") { "html" } else { "video" };
    let once = if opts["once"].as_bool() == Some(true) { 1 } else { 0 };
    let trusted = if opts["trusted"].as_bool() == Some(true) { 1 } else { 0 };
    let query = format!("?fit={}&fade={}&kind={}&once={}&trusted={}&src={}", fit, fade, kind, once, trusted, src);
    let _ = builder(app, "wall", page_url("src/renderer/wall/wall.html", &query))
        .title("Scripture Pod background").decorations(false).position(x, y).inner_size(w, h).fullscreen(true).focused(false).build();
}

// A message from the panel into any window
pub fn post_to_window(app: &AppHandle, label: &str, message: &Value) -> bool {
    match app.get_webview_window(label) {
        Some(w) => { eval(&w, &format!("window.postMessage({}, '*')", message)); true }
        None => false,
    }
}

pub fn open_feed(app: &AppHandle, opts: &Value) {
    close(app, "feed", true);
    let (x, y, w, h) = bounds(app, display_id(opts).as_deref());
    let key = opts["keyBackground"].as_str().filter(|k| ["black", "green"].contains(k)).unwrap_or("none");
    let query = if key == "none" { "?standalone=1&hostMode=standalone&feed=1".to_string() } else { format!("?standalone=1&hostMode=standalone&feed=1&keyBg={}", key) };
    let color = match key { "black" => Some(tauri::window::Color(0, 0, 0, 255)), "green" => Some(tauri::window::Color(0, 177, 64, 255)), _ => None };
    let mut b = builder(app, "feed", page_url(DISPLAY_PAGE, &query)).decorations(false).transparent(key == "none").position(x, y).inner_size(w, h).fullscreen(true).focused(true);
    if let Some(c) = color { b = b.background_color(c); }
    if let Ok(win) = b.build() { watch_closed(app, &win, "feed"); }
}

pub fn open_main(app: &AppHandle) {
    let (w, h) = app.primary_monitor().ok().flatten().map(|m| { let s = m.scale_factor(); (m.size().width as f64 / s, m.size().height as f64 / s) }).unwrap_or((1600.0, 1000.0));
    let win = builder(app, "main", page_url(PANEL_PAGE, ""))
        .title("Scripture Pod").inner_size((w - 32.0).clamp(480.0, 1600.0), (h - 120.0).clamp(560.0, 980.0)).min_inner_size(480.0, 560.0)
        .center().background_color(tauri::window::Color(16, 19, 24, 255)).build();
    if let Ok(win) = win {
        let app2 = app.clone();
        win.on_window_event(move |e| {
            if let WindowEvent::CloseRequested { .. } = e {
                for l in ["output", "feed"] { close(&app2, l, true); }
            }
        });
    }
}
