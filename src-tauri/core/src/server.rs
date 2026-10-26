// HTTP server for OBS browser sources and remote displays (with port fallback).
use crate::state::*;
use std::{fs, io::{Read, Seek, SeekFrom}, sync::{atomic::Ordering, Arc}, thread};
use tiny_http::{Header, Response, Server};

fn header(k: &str, v: &str) -> Header { Header::from_bytes(k.as_bytes(), v.as_bytes()).unwrap() }

// The easy address for a laptop with no app: http://<this computer>:8087/display.html
pub fn start_browser(state: Arc<AppState>, preferred: u16) {
    for port in preferred..preferred + 20 {
        if let Ok(server) = Server::http(("0.0.0.0", port)) {
            state.browser_port.store(port, Ordering::SeqCst);
            thread::spawn(move || {
                for req in server.incoming_requests() {
                    let state = state.clone();
                    thread::spawn(move || handle(req, &state));
                }
            });
            return;
        }
    }
    eprintln!("Scripture Pod: the browser display address could not start");
}

const JOIN_PAGE: &str = r##"<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Scripture Pod display</title>
<style>html,body{height:100%;margin:0;background:#0c0d0f;color:#edeef0;font:16px system-ui,sans-serif}main{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;padding:24px}h1{font-size:22px;margin:0}p{margin:0;color:#a3a9b0;max-width:420px;line-height:1.45}.dot{width:12px;height:12px;border-radius:50%;background:#3b9eff;animation:p 1.4s ease-in-out infinite}@keyframes p{50%{opacity:.25}}</style></head>
<body><main><div class="dot" id="dot"></div><h1 id="t">Waiting to be allowed</h1><p id="m">The computer running Scripture Pod needs to choose this laptop. Keep this page open: the display starts by itself.</p></main>
<script>
(function(){var role="__ROLE__",sid="",tm=null;
function name(){var ua=navigator.userAgent,os=/Windows/.test(ua)?"Windows":/Mac/.test(ua)?"Mac":/Linux/.test(ua)?"Linux":/Android/.test(ua)?"Android":"Device";var b=/Edg\//.test(ua)?"Edge":/Chrome\//.test(ua)?"Chrome":/Firefox\//.test(ua)?"Firefox":/Safari\//.test(ua)?"Safari":"Browser";return os+" · "+b}
function show(t,m,color){document.getElementById("t").textContent=t;document.getElementById("m").textContent=m;document.getElementById("dot").style.background=color||"#3b9eff"}
function poll(){fetch("/__join/"+sid).then(function(r){return r.json()}).then(function(j){
 if(j.status==="approved"&&j.url){location.href=j.url;return}
 if(j.status==="denied"){show("Not allowed","The controlling computer did not allow this laptop.","#e5372a");return}
 if(j.status==="revoked"){show("Disconnected","The controlling computer closed this display.","#8b9299");return}
 tm=setTimeout(poll,1500)}).catch(function(){tm=setTimeout(poll,3000)})}
fetch("/__join",{method:"POST",body:JSON.stringify({name:name(),role:role})}).then(function(r){return r.json()}).then(function(j){sid=j.sid;poll()}).catch(function(){show("Could not reach the computer","Check that this laptop is on the same network.","#e5372a")});
})();
</script></body></html>"##;

// A browser opened the display address: it asks to join, is let in when the controlling app allows it
fn join_request(mut req: tiny_http::Request, state: &AppState, path: &str) {
    let json = |code: u16, body: String| Response::from_string(body).with_status_code(code).with_header(header("Content-Type", "application/json")).with_header(header("Cache-Control", "no-store"));
    let ip = req.remote_addr().map(|a| a.ip().to_string()).unwrap_or_default();
    let host = req.headers().iter().find(|h| h.field.equiv("Host")).map(|h| h.value.to_string()).unwrap_or_default();
    if req.method() == &tiny_http::Method::Post {
        let mut body = String::new();
        let _ = req.as_reader().take(2048).read_to_string(&mut body);
        let v: serde_json::Value = serde_json::from_str(&body).unwrap_or(serde_json::Value::Null);
        let name: String = v["name"].as_str().unwrap_or("Browser").chars().take(60).collect();
        let sid = random_hex(8);
        let allowed = state.allowed_ips.lock().unwrap().get(&ip).cloned();
        let role = allowed.clone().unwrap_or_else(|| if v["role"].as_str() == Some("monitor") { "monitor".into() } else { "live".into() });
        let status = if allowed.is_some() { "approved" } else { "pending" };
        let now = std::time::Instant::now();
        let mut joins = state.joins.lock().unwrap();
        joins.retain(|_, j| now.duration_since(j.seen).as_secs() < 3600);
        joins.insert(sid.clone(), Join { sid: sid.clone(), ip, name, status: status.into(), role, at: now, seen: now });
        return { let _ = req.respond(json(200, serde_json::json!({"sid": sid, "status": status}).to_string())); };
    }
    let sid = path.trim_start_matches("/__join/").to_string();
    let mut joins = state.joins.lock().unwrap();
    let Some(j) = joins.get_mut(&sid) else { drop(joins); return { let _ = req.respond(json(404, r#"{"status":"unknown"}"#.into())); }; };
    j.seen = std::time::Instant::now();
    let mut out = serde_json::json!({"status": j.status});
    if j.status == "approved" {
        // The page is opened on the same address it was loaded from (this computer, as that laptop reaches it)
        let hostname = host.rsplit_once(':').map(|(h, _)| h).unwrap_or(&host).to_string();
        let role = if j.role == "monitor" { "&role=monitor" } else { "" };
        let url = format!("http://{}/{}?hostMode=websocket&relay=ws%3A%2F%2F{}%3A{}&relayToken={}&sid={}{}", host, DISPLAY_PAGE, hostname, state.relay_port.load(Ordering::SeqCst), state.token, j.sid, role);
        out["url"] = serde_json::Value::String(url);
    }
    drop(joins);
    let _ = req.respond(json(200, out.to_string()));
}

pub fn start(state: Arc<AppState>, preferred: u16) {
    for port in preferred..preferred + 20 {
        if let Ok(server) = Server::http(("0.0.0.0", port)) {
            state.http_port.store(port, Ordering::SeqCst);
            thread::spawn(move || {
                for req in server.incoming_requests() {
                    let state = state.clone();
                    thread::spawn(move || handle(req, &state));
                }
            });
            return;
        }
    }
    eprintln!("Scripture Pod: the local display server could not start");
}

// Another computer asks this one to show its display. It must be switched on, know the pairing code,
// and the address to open must be that computer's own display page (never an arbitrary web address).
fn connect_request(mut req: tiny_http::Request, state: &AppState, path: &str) {
    let json = |code: u16, body: &str| Response::from_string(body.to_string()).with_status_code(code).with_header(header("Content-Type", "application/json"));
    let from = req.remote_addr().map(|a| a.ip().to_string()).unwrap_or_default();
    let mut body = String::new();
    let _ = req.as_reader().take(4096).read_to_string(&mut body);
    let v: serde_json::Value = serde_json::from_str(&body).unwrap_or(serde_json::Value::Null);
    if !state.receiver_enabled.load(Ordering::SeqCst) { return { let _ = req.respond(json(403, r#"{"error":"This computer is not accepting projections"}"#)); }; }
    let code = v["code"].as_str().unwrap_or("");
    let (a, b) = (code.as_bytes(), state.pair_code.as_bytes());
    let code_ok = a.len() == b.len() && a.iter().zip(b).fold(0u8, |d, (x, y)| d | (x ^ y)) == 0;
    if !code_ok { return { let _ = req.respond(json(403, r#"{"error":"Wrong pairing code"}"#)); }; }
    let handler = state.on_connect.lock().unwrap().clone();
    let Some(handler) = handler else { return { let _ = req.respond(json(503, r#"{"error":"Not ready"}"#)); }; };
    if path == "/__disconnect" { handler(None); let _ = req.respond(json(200, r#"{"ok":true}"#)); return; }
    let url = v["url"].as_str().unwrap_or("");
    let prefix = format!("http://{}:", from);
    let allowed = url.starts_with(&prefix) && url[prefix.len()..].split_once('/').map(|(_, path)| path.starts_with(DISPLAY_PAGE)).unwrap_or(false);
    if !allowed { return { let _ = req.respond(json(400, r#"{"error":"That address is not allowed"}"#)); }; }
    handler(Some(url.to_string()));
    let _ = req.respond(json(200, r#"{"ok":true}"#));
}

fn handle(req: tiny_http::Request, state: &AppState) {
    let full = req.url().to_string();
    let bare = full.split('?').next().unwrap_or("");
    if bare == "/display.html" || bare == "/monitor.html" || bare == "/join" {
        let role = if bare == "/monitor.html" { "monitor" } else { "live" };
        let page = JOIN_PAGE.replace("__ROLE__", role);
        let _ = req.respond(Response::from_string(page).with_header(header("Content-Type", "text/html; charset=utf-8")).with_header(header("Cache-Control", "no-store")));
        return;
    }
    if bare == "/__join" || bare.starts_with("/__join/") { return join_request(req, state, bare); }
    if req.method() == &tiny_http::Method::Post && (full == "/__connect" || full == "/__disconnect") { return connect_request(req, state, &full); }
    let (path, query) = full.split_once('?').map(|(p, q)| (p.to_string(), format!("?{}", q))).unwrap_or((full.clone(), String::new()));
    if let Some(id) = path.strip_prefix("/background-media/") { return media(req, state, id); }
    if path == "/UI/scripture-pod-display.html" {
        let _ = req.respond(Response::empty(302).with_header(header("Location", &format!("/{}{}", DISPLAY_PAGE, query))));
        return;
    }
    let rel = percent_decode(if path == "/" { DISPLAY_PAGE } else { &path });
    match resolve_app_file(&state.root, &rel) {
        // Browsers (WebKit above all) only play video when the server answers byte ranges
        Some(p) => serve_file(req, &p, content_type(&p), "no-cache"),
        None => { let _ = req.respond(Response::from_string("Not found").with_status_code(404)); }
    }
}

fn media(req: tiny_http::Request, state: &AppState, id: &str) {
    let entry = state.media.lock().unwrap().get(id).cloned();
    let Some((path, mime)) = entry else { let _ = req.respond(Response::from_string("Media not found").with_status_code(404)); return; };
    serve_file(req, &path, &mime, "private, max-age=3600");
}

fn serve_file(req: tiny_http::Request, path: &std::path::Path, mime: &str, cache: &str) {
    let Ok(mut f) = fs::File::open(path) else { let _ = req.respond(Response::from_string("Not found").with_status_code(404)); return; };
    let size = f.metadata().map(|m| m.len()).unwrap_or(0);
    let range = req.headers().iter().find(|h| h.field.equiv("Range")).map(|h| h.value.to_string());
    let (start, end, partial) = match range.as_deref().and_then(|r| r.strip_prefix("bytes=")).and_then(|r| r.split_once('-')) {
        Some((a, b)) => {
            let (a, b) = (a.parse::<u64>().ok(), b.parse::<u64>().ok());
            let (s, e) = match (a, b) {
                (Some(s), Some(e)) => (s, e.min(size.saturating_sub(1))),
                (Some(s), None) => (s, size.saturating_sub(1)),
                (None, Some(n)) => (size.saturating_sub(n), size.saturating_sub(1)),
                _ => { let _ = req.respond(Response::empty(416).with_header(header("Content-Range", &format!("bytes */{}", size)))); return; }
            };
            if s >= size || e < s { let _ = req.respond(Response::empty(416).with_header(header("Content-Range", &format!("bytes */{}", size)))); return; }
            (s, e, true)
        }
        None => (0, size.saturating_sub(1), false),
    };
    let _ = f.seek(SeekFrom::Start(start));
    let len = if size == 0 { 0 } else { end - start + 1 };
    let mut resp = Response::new(if partial { 206.into() } else { 200.into() },
        vec![header("Accept-Ranges", "bytes"), header("Cache-Control", cache), header("Content-Type", mime)],
        f.take(len), Some(len as usize), None);
    if partial { resp = resp.with_header(header("Content-Range", &format!("bytes {}-{}/{}", start, end, size))); }
    let _ = req.respond(resp);
}
