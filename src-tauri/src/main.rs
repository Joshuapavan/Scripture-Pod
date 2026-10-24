// Scripture Pod desktop app: servers, relay, Bible search and windows.
// A release build is a plain windowed app: no console window opens next to it on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod api;
mod windows;

use sp_core::{relay, server, state::*};
use std::{fs, path::PathBuf, sync::{atomic::Ordering, Arc}, thread};
use tauri::{http::Response, Manager};

fn app_root(app: &tauri::App) -> PathBuf {
    // Packaged: resources/app. Development: the project folder one level up.
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf();
    // Development builds read the project folder directly so edits show without a rebuild
    if cfg!(debug_assertions) || cfg!(feature = "harness") { return dev; }
    app.path().resource_dir().ok().map(|d| d.join("app")).filter(|d| d.join("src").is_dir()).unwrap_or(dev)
}

fn env_port(name: &str, default: u16) -> u16 { std::env::var(name).ok().and_then(|v| v.parse().ok()).unwrap_or(default) }

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .register_asynchronous_uri_scheme_protocol("sp", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            let path = request.uri().path().to_string();
            let body = String::from_utf8_lossy(request.body()).to_string();
            let query = request.uri().query().unwrap_or("").to_string();
            thread::spawn(move || {
                let state = app.state::<Arc<AppState>>().inner().clone();
                let reply = |status: u16, ctype: &str, data: Vec<u8>| {
                    // Local files: never serve a stale copy after an update
                    Response::builder().status(status).header("Content-Type", ctype).header("Cache-Control", "no-store").body(data).unwrap()
                };
                if let Some(name) = path.strip_prefix("/__bsp/") {
                    let label = query.split('&').find_map(|kv| kv.strip_prefix("label=")).unwrap_or("");
                    let out = api::handle(&app, &state, name, label, &body).to_string();
                    return responder.respond(reply(200, "application/json", out.into_bytes()));
                }
                let rel = percent_decode(&path);
                match resolve_app_file(&state.root, &rel).and_then(|p| fs::read(&p).ok().map(|d| (p, d))) {
                    Some((p, data)) => responder.respond(reply(200, content_type(&p), data)),
                    None => responder.respond(reply(404, "text/plain", b"Not found".to_vec())),
                }
            });
        })
        .setup(|app| {
            let data_dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
            let state = Arc::new(AppState::new(app_root(app), data_dir));
            let http = env_port("SCRIPTURE_POD_HTTP_PORT", 5510);
            let relay_port = env_port("SCRIPTURE_POD_RELAY_PORT", 5511);
            server::start(state.clone(), http);
            if let Some(p) = relay::start(state.relay.clone(), state.token.clone(), relay_port) { state.relay_port.store(p, Ordering::SeqCst); }
            #[cfg(any(debug_assertions, feature = "harness"))]
            println!("Scripture Pod display URL: {}", api::local_server_info(&state)["displayUrl"].as_str().unwrap_or(""));
            app.manage(state.clone());
            app.manage(Arc::new(windows::SilentClose::default()));
            windows::open_main(app.handle());
            // Development harness: SP_SCRIPT=<file.js> runs a script in the panel and prints its result
            #[cfg(any(debug_assertions, feature = "harness"))]
            if let Ok(file) = std::env::var("SP_SCRIPT") {
                let handle = app.handle().clone();
                thread::spawn(move || {
                    thread::sleep(std::time::Duration::from_secs(std::env::var("SP_DELAY").ok().and_then(|v| v.parse().ok()).unwrap_or(6)));
                    let code = fs::read_to_string(file).unwrap_or_default();
                    if let Some(w) = handle.get_webview_window("main") {
                        let _ = w.eval(&format!("(async()=>{{try{{const r=await (async()=>{{{}}})();await fetch('/__bsp/log?label=result',{{method:'POST',body:JSON.stringify(JSON.stringify(r))}});}}catch(e){{await fetch('/__bsp/log?label=error',{{method:'POST',body:JSON.stringify(String(e&&e.message||e)+' '+String(e&&e.stack||''))}});}}}})()", code));
                    }
                });
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build Scripture Pod")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                let dir = app.state::<Arc<AppState>>().media_dir.lock().unwrap().clone();
                if let Some(d) = dir { let _ = fs::remove_dir_all(d); }
            }
        });
}
