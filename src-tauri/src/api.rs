// What the desktop bridge offers the pages, as /__bsp/<name> calls.
use crate::{search, state::*, windows};
use base64::Engine;
use serde_json::{json, Value};
use std::{fs, path::PathBuf, sync::{atomic::Ordering, Arc}};
use tauri::{AppHandle, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

fn lan_addresses() -> Vec<String> {
    let mut v: Vec<String> = if_addrs::get_if_addrs().unwrap_or_default().into_iter()
        .filter(|i| !i.is_loopback()).filter_map(|i| match i.ip() { std::net::IpAddr::V4(a) => Some(a.to_string()), _ => None }).collect();
    v.dedup();
    v
}

pub fn local_server_info(state: &AppState) -> Value {
    let addrs = lan_addresses();
    let host = addrs.first().cloned().unwrap_or_else(|| "127.0.0.1".into());
    let (hp, rp) = (state.http_port.load(Ordering::SeqCst), state.relay_port.load(Ordering::SeqCst));
    let relay = format!("ws://{}:{}", host, rp);
    let enc = |s: &str| s.replace(':', "%3A").replace('/', "%2F");
    let mut available = vec!["127.0.0.1".to_string()];
    available.extend(addrs);
    json!({
        "httpPort": hp, "relayPort": rp, "preferredHost": host, "availableHosts": available,
        "displayPath": format!("/{}", DISPLAY_PAGE),
        "displayUrl": format!("http://{}:{}/{}?hostMode=websocket&relay={}&relayToken={}", host, hp, DISPLAY_PAGE, enc(&relay), state.token),
        "relayUrl": relay, "relayToken": state.token
    })
}

pub fn handle(app: &AppHandle, state: &Arc<AppState>, name: &str, label: &str, body: &str) -> Value {
    let arg: Value = serde_json::from_str(body).unwrap_or(Value::Null);
    let err = |m: &str| json!({"error": m});
    match name {
        "getDisplays" => windows::displays(app),
        "openOutput" => { windows::open_output(app, &arg); json!({"ok": true}) }
        "closeOutput" => { windows::close(app, "output", false); json!({"ok": true}) }
        "isOutputOpen" => json!(app.get_webview_window("output").is_some()),
        "openFeed" => { windows::open_feed(app, &arg); json!({"ok": true}) }
        "closeFeed" => { windows::close(app, "feed", true); json!({"ok": true}) }
        "isFeedOpen" => json!(app.get_webview_window("feed").is_some()),
        "sendOutputMessage" => json!({"ok": windows::post_to_outputs(app, &arg)}),
        "sendWebSocketOutputMessage" => {
            state.relay.broadcast(&if let Some(s) = arg.as_str() { s.to_string() } else { arg.to_string() }, None);
            json!({"ok": true})
        }
        "requestOutputFullscreen" => {
            if let Some(w) = app.get_webview_window("output") { let _ = w.set_fullscreen(true); }
            json!({"ok": true})
        }
        "getLocalServerInfo" => local_server_info(state),
        "bibleSearch" => {
            let mut conn = state.db.lock().unwrap();
            search::call(&mut conn, arg["method"].as_str().unwrap_or(""), &arg["payload"]).unwrap_or_else(|e| err(&e))
        }
        "listBundledBibleFiles" => {
            let mut names: Vec<String> = fs::read_dir(state.root.join("assets/bibles")).map(|d| d.filter_map(|e| e.ok())
                .map(|e| e.file_name().to_string_lossy().to_string()).filter(|n| n.to_lowercase().ends_with(".xml")).collect()).unwrap_or_default();
            names.sort_by_key(|n| n.to_lowercase());
            json!(names.into_iter().map(|n| json!({"directory": "assets/bibles", "name": n})).collect::<Vec<_>>())
        }
        "readBundledBibleFile" => {
            let n = arg["name"].as_str().unwrap_or("");
            if arg["directory"].as_str() != Some("assets/bibles") { return err("Invalid Bible asset directory"); }
            if n.is_empty() || n.contains('/') || n.contains('\\') || n.contains("..") || !n.to_lowercase().ends_with(".xml") { return err("Invalid Bible asset filename"); }
            // WebKit's XML parser rejects a leading BOM that Chromium tolerates
            match fs::read_to_string(state.root.join("assets/bibles").join(n)) {
                Ok(c) => json!({"name": n, "contents": c.trim_start_matches('\u{feff}')}),
                Err(e) => err(&e.to_string()),
            }
        }
        "readBundledChurchLogo" => match fs::read(state.root.join("assets/logo/ACI_Logo.png")) {
            Ok(b) => json!({"name": "ACI_Logo.png", "contents": base64::engine::general_purpose::STANDARD.encode(b)}),
            Err(e) => err(&e.to_string()),
        },
        "cacheBackgroundMedia" => cache_media(app, state, arg.as_str().unwrap_or("")),
        "copyText" => { let _ = app.clipboard().write_text(arg.as_str().unwrap_or("").to_string()); json!({"ok": true}) }
        "saveBackup" => {
            let Some(contents) = arg["contents"].as_str() else { return err("Backup contents must be text"); };
            let picked = app.dialog().file().set_title("Export Backup")
                .set_file_name(arg["filename"].as_str().unwrap_or("ScripturePodPro_Backup.json"))
                .add_filter("JSON Backup", &["json"]).blocking_save_file();
            let Some(path) = picked.and_then(|p| p.into_path().ok()) else { return json!({"canceled": true}); };
            match fs::write(&path, contents) {
                Ok(_) => json!({"ok": true, "filePath": path.to_string_lossy(), "bytesWritten": fs::metadata(&path).map(|m| m.len()).unwrap_or(0)}),
                Err(e) => err(&e.to_string()),
            }
        }
        "openBackup" => {
            let picked = app.dialog().file().set_title("Import Backup").add_filter("JSON Backup", &["json"]).blocking_pick_file();
            let Some(path) = picked.and_then(|p| p.into_path().ok()) else { return json!({"canceled": true}); };
            match fs::read_to_string(&path) {
                Ok(c) => json!({"name": path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(), "contents": c}),
                Err(e) => err(&e.to_string()),
            }
        }
        "openInLocation" => {
            if let Some(p) = arg.as_str().filter(|p| !p.is_empty()) { let _ = app.opener().reveal_item_in_dir(p); }
            json!({"ok": true})
        }
        "log" => { println!("[page:{}] {}", label, arg); json!(true) }
        "outputReady" => { if label == "output" || label == "feed" { windows::emit_main(app, "output-ready"); } json!(true) }
        _ => err("unknown call"),
    }
}

fn cache_media(app: &AppHandle, state: &Arc<AppState>, data_url: &str) -> Value {
    let err = |m: &str| json!({"error": m});
    let Some(rest) = data_url.strip_prefix("data:") else { return err("Unsupported background media data"); };
    let Some((meta, b64)) = rest.split_once(";base64,") else { return err("Unsupported background media data"); };
    let Some((kind, sub)) = meta.split_once('/') else { return err("Unsupported background media data"); };
    let sub = sub.to_lowercase();
    if !(kind == "image" || kind == "video") || sub.is_empty() || !sub.chars().all(|c| c.is_ascii_alphanumeric() || ".+-".contains(c)) {
        return err("Unsupported background media data");
    }
    let clean: String = b64.chars().filter(|c| !c.is_whitespace()).collect();
    let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(clean) else { return err("Unsupported background media data"); };
    if bytes.is_empty() { return err("Background media is empty"); }
    let dir = {
        let mut d = state.media_dir.lock().unwrap();
        if d.is_none() {
            let p: PathBuf = app.path().temp_dir().unwrap_or_else(|_| std::env::temp_dir()).join(format!("scripture-pod-media-{}", random_hex(4)));
            let _ = fs::create_dir_all(&p);
            *d = Some(p);
        }
        d.clone().unwrap()
    };
    let id = uuid_v4();
    let path = dir.join(format!("{}.{}", id, sub));
    if let Err(e) = fs::write(&path, bytes) { return err(&e.to_string()); }
    state.media.lock().unwrap().insert(id.clone(), (path, format!("{}/{}", kind, sub)));
    let host = local_server_info(state)["preferredHost"].as_str().unwrap_or("127.0.0.1").to_string();
    json!({"url": format!("http://{}:{}/background-media/{}", host, state.http_port.load(Ordering::SeqCst), id)})
}
