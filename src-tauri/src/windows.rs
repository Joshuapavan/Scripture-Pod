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

pub fn post_to_outputs(app: &AppHandle, message: &Value) -> bool {
    let js = format!("window.postMessage({}, '*')", message);
    let mut any = false;
    for label in ["output", "feed"] {
        if let Some(w) = app.get_webview_window(label) { eval(&w, &js); any = true; }
    }
    any
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
