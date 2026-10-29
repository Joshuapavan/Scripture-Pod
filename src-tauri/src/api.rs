// What the desktop bridge offers the pages, as /__bsp/<name> calls.
use crate::windows;
use sp_core::discovery;
use sp_core::{search, state::*};
use base64::Engine;
use serde_json::{json, Value};
use std::{fs, path::PathBuf, sync::{atomic::Ordering, Arc}};
use tauri::{AppHandle, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

// Addresses another device on the network can reach this computer at. Virtual interfaces (VPN, Docker,
// AirDrop, VM bridges) and link-local addresses are left out, and real Wi-Fi/Ethernet addresses
// on private ranges come first, so joining Ethernet as well as Wi-Fi lists both.
fn lan_addresses() -> Vec<String> {
    let skip = ["utun", "awdl", "llw", "bridge", "docker", "veth", "vmnet", "vboxnet", "vnic", "tailscale", "zt", "tun", "tap", "lo"];
    let mut found: Vec<(u8, String)> = if_addrs::get_if_addrs().unwrap_or_default().into_iter()
        .filter(|i| !i.is_loopback())
        .filter(|i| { let n = i.name.to_lowercase(); !skip.iter().any(|p| n.starts_with(p)) })
        .filter_map(|i| match i.ip() {
            std::net::IpAddr::V4(a) if !a.is_link_local() && !a.is_unspecified() => {
                let rank = if a.is_private() { 0 } else { 1 };
                Some((rank, a.to_string()))
            }
            _ => None,
        })
        .collect();
    found.sort_by_key(|(rank, _)| *rank);
    let mut v: Vec<String> = found.into_iter().map(|(_, a)| a).collect();
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

// Lyrics sites that do not allow requests from a web page are fetched here, from the app itself.
// Only these hosts, over https, are allowed.
const FETCH_HOSTS: [&str; 3] = ["tamilchristiansongs.in", "waytochurch.com", "kannadateluguchristiansongslyrics.blogspot.com"];

fn fetch_text(arg: &Value) -> Value {
    let url = arg["url"].as_str().unwrap_or("");
    let allowed = url.strip_prefix("https://").map(|rest| {
        let host = rest.split(|c| c == '/' || c == '?' || c == '#').next().unwrap_or("");
        FETCH_HOSTS.iter().any(|h| host == *h)
    }).unwrap_or(false);
    if !allowed { return json!({"error": "That address is not allowed"}); }
    let agent = ureq::AgentBuilder::new().timeout(std::time::Duration::from_secs(15)).build();
    match agent.get(url).set("Accept", "application/json,text/html").call() {
        Ok(resp) => {
            let status = resp.status();
            let mut body = String::new();
            use std::io::Read;
            let _ = resp.into_reader().take(3_000_000).read_to_string(&mut body);
            json!({"ok": true, "status": status, "body": body})
        }
        Err(ureq::Error::Status(code, _)) => json!({"ok": false, "status": code, "body": ""}),
        Err(e) => json!({"error": e.to_string()}),
    }
}

// Ask another computer (found on the network) to open this computer's display page, or to stop.
// The address of the computer comes from its beacon, never from the page, and must be a private one.
fn connect_device(state: &Arc<AppState>, arg: &Value, open: bool) -> Value {
    let id = arg["id"].as_str().unwrap_or("");
    let code = arg["code"].as_str().unwrap_or("");
    let Some(peer) = state.peers.lock().unwrap().get(id).cloned() else { return json!({"error": "That computer is no longer on the network"}); };
    let Ok(ip) = peer.ip.parse::<std::net::Ipv4Addr>() else { return json!({"error": "Unsupported address"}); };
    if !ip.is_private() { return json!({"error": "Only computers on your own network can be used"}); }
    // This computer's address on the same network as that computer
    let prefix: Vec<u8> = ip.octets()[..3].to_vec();
    let same_net = lan_addresses().into_iter().find(|a| a.parse::<std::net::Ipv4Addr>().map(|x| x.octets()[..3] == prefix[..]).unwrap_or(false));
    let host = same_net.unwrap_or_else(|| lan_addresses().first().cloned().unwrap_or_else(|| "127.0.0.1".into()));
    let (hp, rp) = (state.http_port.load(Ordering::SeqCst), state.relay_port.load(Ordering::SeqCst));
    let role = match arg["role"].as_str() { Some("monitor") => "&role=monitor", Some("stage") => "&role=stage", Some("media") => "&role=media", _ => "" };
    let url = format!("http://{}:{}/{}?hostMode=websocket&relay=ws%3A%2F%2F{}%3A{}&relayToken={}{}", host, hp, DISPLAY_PAGE, host, rp, state.token, role);
    let path = if open { "/__connect" } else { "/__disconnect" };
    let body = json!({"url": url, "code": code}).to_string();
    let agent = ureq::AgentBuilder::new().timeout(std::time::Duration::from_secs(6)).build();
    match agent.post(&format!("http://{}:{}{}", peer.ip, peer.port, path)).set("Content-Type", "application/json").send_string(&body) {
        Ok(_) => json!({"ok": true}),
        Err(ureq::Error::Status(_, resp)) => {
            let text = resp.into_string().unwrap_or_default();
            let msg = serde_json::from_str::<Value>(&text).ok().and_then(|v| v["error"].as_str().map(String::from)).unwrap_or_else(|| "The other computer refused".into());
            json!({"error": msg})
        }
        Err(e) => json!({"error": format!("Could not reach that computer: {}", e)}),
    }
}

// Laptops and other devices on this network: wake the neighbours with a tiny packet, then read the system's address table
fn scan_network(state: &Arc<AppState>) -> Value {
    let own: Vec<String> = lan_addresses();
    let mut nets: Vec<[u8; 3]> = Vec::new();
    for a in &own { if let Ok(ip) = a.parse::<std::net::Ipv4Addr>() { let o = ip.octets(); if ip.is_private() && !nets.contains(&[o[0], o[1], o[2]]) { nets.push([o[0], o[1], o[2]]); } } }
    if let Ok(sock) = std::net::UdpSocket::bind("0.0.0.0:0") {
        for n in &nets { for h in 1..255u8 { let _ = sock.send_to(&[0u8], (std::net::Ipv4Addr::new(n[0], n[1], n[2], h), 9)); } }
    }
    std::thread::sleep(std::time::Duration::from_millis(1200));
    let out = std::process::Command::new("arp").arg("-a").output().ok().and_then(|o| String::from_utf8(o.stdout).ok()).unwrap_or_default();
    let mut found: Vec<(String, String)> = Vec::new();
    for line in out.lines() {
        let ip = line.split(|c: char| !(c.is_ascii_digit() || c == '.')).find(|t| t.parse::<std::net::Ipv4Addr>().is_ok()).unwrap_or("").to_string();
        if ip.is_empty() || own.contains(&ip) || line.contains("incomplete") || line.to_lowercase().contains("ff:ff:ff:ff:ff:ff") || line.to_lowercase().contains("ff-ff-ff-ff-ff-ff") { continue; }
        let Ok(addr) = ip.parse::<std::net::Ipv4Addr>() else { continue };
        if !addr.is_private() || addr.octets()[3] == 255 || addr.octets()[3] == 0 { continue; }
        // a name the system printed for it, if there is one: "name (ip)"
        let name = line.split_whitespace().next().filter(|w| *w != "?" && !w.starts_with('(') && w.parse::<std::net::Ipv4Addr>().is_err()).unwrap_or("").trim_end_matches(".local").to_string();
        if !found.iter().any(|(i, _)| *i == ip) { found.push((ip, name)); }
    }
    // names the system did not print: ask the devices themselves
    let unnamed: Vec<String> = found.iter().filter(|(_, n)| n.is_empty()).map(|(ip, _)| ip.clone()).collect();
    for (ip, name) in crate::names::lookup_many(&unnamed) {
        if !name.is_empty() { if let Some(f) = found.iter_mut().find(|(i, _)| *i == ip) { f.1 = name; } }
    }
    found.sort_by_key(|(ip, _)| ip.parse::<std::net::Ipv4Addr>().map(|a| a.octets()).unwrap_or([0; 4]));
    let joins = state.joins.lock().unwrap();
    let allowed = state.allowed_ips.lock().unwrap();
    json!(found.iter().map(|(ip, name)| {
        let joined = joins.values().filter(|j| &j.ip == ip && j.status == "approved").max_by_key(|j| j.seen);
        json!({"ip": ip, "name": if name.is_empty() { joined.map(|j| j.name.clone()).unwrap_or_default() } else { name.clone() },
               "selected": allowed.contains_key(ip), "role": allowed.get(ip).cloned().unwrap_or_default()})
    }).collect::<Vec<_>>())
}

// ── In-app update download ───────────────────────────────────────────────────
// The installer for this computer is downloaded from the project's GitHub release into the Downloads
// folder, with progress, and can then be opened. Only that project's release files are allowed.
#[derive(Clone, Default)]
struct UpdateProgress { state: String, received: u64, total: u64, path: String, error: String }
static UPDATE: std::sync::Mutex<Option<UpdateProgress>> = std::sync::Mutex::new(None);
const RELEASE_PREFIX: &str = "https://github.com/Joshuapavan/Scripture-Pod-V2/releases/download/";

// The file of a release that suits this computer (system and processor)
fn pick_asset(assets: &Value) -> Value {
    let list = assets.as_array().cloned().unwrap_or_default();
    let name = |a: &Value| a["name"].as_str().unwrap_or("").to_lowercase();
    let arm = cfg!(target_arch = "aarch64");
    let ends = |a: &Value, e: &[&str]| e.iter().any(|x| name(a).ends_with(x));
    let arch_ok = |a: &Value| { let n = name(a); if arm { n.contains("aarch64") || n.contains("arm64") } else { n.contains("x64") || n.contains("x86_64") || n.contains("amd64") || !(n.contains("aarch64") || n.contains("arm64")) } };
    let want: &[&str] = if cfg!(target_os = "macos") { &[".dmg"] } else if cfg!(target_os = "windows") { &[".exe", ".msi"] } else { &[".appimage", ".deb"] };
    let pick = list.iter().find(|a| ends(a, want) && arch_ok(a)).or_else(|| list.iter().find(|a| ends(a, want)));
    match pick { Some(a) => json!({"name": a["name"], "url": a["browser_download_url"], "size": a["size"]}), None => Value::Null }
}

fn start_update_download(app: &AppHandle, arg: &Value) -> Value {
    let url = arg["url"].as_str().unwrap_or("").to_string();
    let name = arg["name"].as_str().unwrap_or("").to_string();
    if !url.starts_with(RELEASE_PREFIX) || name.is_empty() || name.contains('/') || name.contains('\\') { return json!({"error": "That download is not allowed"}); }
    if UPDATE.lock().unwrap().as_ref().map(|u| u.state == "downloading").unwrap_or(false) { return json!({"ok": true}); }
    let Ok(dir) = app.path().download_dir() else { return json!({"error": "There is no Downloads folder"}); };
    let total = arg["size"].as_u64().unwrap_or(0);
    *UPDATE.lock().unwrap() = Some(UpdateProgress { state: "downloading".into(), total, ..Default::default() });
    std::thread::spawn(move || {
        let fail = |m: String| { let mut g = UPDATE.lock().unwrap(); let p = g.get_or_insert_with(Default::default); p.state = "error".into(); p.error = m; };
        let agent = ureq::AgentBuilder::new().timeout_connect(std::time::Duration::from_secs(15)).build();
        let resp = match agent.get(&url).set("User-Agent", "scripture-pod").call() { Ok(r) => r, Err(e) => return fail(format!("Download failed: {}", e)) };
        let size = resp.header("Content-Length").and_then(|v| v.parse::<u64>().ok()).unwrap_or(total);
        if let Some(p) = UPDATE.lock().unwrap().as_mut() { p.total = size; }
        let part = dir.join(format!("{}.part", name));
        let Ok(mut file) = std::fs::File::create(&part) else { return fail("Could not write to the Downloads folder".into()) };
        let mut reader = resp.into_reader();
        let mut buf = vec![0u8; 64 * 1024];
        let mut got: u64 = 0;
        use std::io::{Read, Write};
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => { if file.write_all(&buf[..n]).is_err() { return fail("Could not write to the Downloads folder".into()); } got += n as u64; if let Some(p) = UPDATE.lock().unwrap().as_mut() { p.received = got; } }
                Err(e) => return fail(format!("Download interrupted: {}", e)),
            }
        }
        drop(file);
        if size > 0 && got != size { let _ = std::fs::remove_file(&part); return fail("The download was incomplete".into()); }
        let done = dir.join(&name);
        let _ = std::fs::remove_file(&done);
        if std::fs::rename(&part, &done).is_err() { return fail("Could not finish the download".into()); }
        if let Some(p) = UPDATE.lock().unwrap().as_mut() { p.state = "done".into(); p.received = got; p.path = done.to_string_lossy().to_string(); }
    });
    json!({"ok": true})
}

pub fn handle(app: &AppHandle, state: &Arc<AppState>, name: &str, label: &str, body: &str) -> Value {
    let arg: Value = serde_json::from_str(body).unwrap_or(Value::Null);
    let err = |m: &str| json!({"error": m});
    match name {
        "getDisplays" => windows::displays(app),
        "openOutput" => { windows::open_output(app, &arg); json!({"ok": true}) }
        "closeOutput" => { windows::close(app, "output", false); json!({"ok": true}) }
        "isOutputOpen" => json!(app.get_webview_window("output").is_some()),
        "identifyScreens" => json!({"count": windows::identify_screens(app)}),
        "openStage" => { windows::open_stage(app, &arg); json!({"ok": true}) }
        "closeStage" => { windows::close(app, "stage", true); json!({"ok": true}) }
        "isStageOpen" => json!(app.get_webview_window("stage").is_some()),
        // Background wall: a looping silent video on its own screen (an LED wall behind the stage, say)
        "pickVideoFiles" => {
            let picked = app.dialog().file().set_title("Choose background videos").add_filter("Video", &["mp4", "m4v", "mov", "webm", "mkv", "ogv"]).blocking_pick_files();
            let files: Vec<Value> = picked.unwrap_or_default().into_iter().filter_map(|f| f.into_path().ok())
                .map(|p| json!({"path": p.to_string_lossy(), "name": p.file_stem().map(|n| n.to_string_lossy().to_string()).unwrap_or_default()})).collect();
            json!({"files": files})
        }
        // Stream media: videos and web pages (HTML) from this computer
        "pickMediaFiles" => {
            let picked = app.dialog().file().set_title("Choose videos or web pages").add_filter("Videos and web pages", &["mp4", "m4v", "mov", "webm", "mkv", "ogv", "html", "htm"]).blocking_pick_files();
            let files: Vec<Value> = picked.unwrap_or_default().into_iter().filter_map(|f| f.into_path().ok())
                .map(|p| json!({"path": p.to_string_lossy(), "name": p.file_stem().map(|n| n.to_string_lossy().to_string()).unwrap_or_default()})).collect();
            json!({"files": files})
        }
        "registerMediaFile" => register_media_file(state, arg["path"].as_str().unwrap_or("")),
        "openWall" => { windows::open_wall(app, &arg); json!({"ok": true}) }
        "closeWall" => { windows::close(app, "wall", true); json!({"ok": true}) }
        "isWallOpen" => json!(app.get_webview_window("wall").is_some()),
        "sendToWall" => json!({"ok": windows::post_to_window(app, "wall", &arg)}),
        "openDisplays" => { windows::open_displays(app, &arg); json!({"ok": true}) }
        "closeDisplays" => { windows::close(app, "displays", true); json!({"ok": true}) }
        "isDisplaysOpen" => json!(app.get_webview_window("displays").is_some()),
        "sendToDisplays" => json!({"ok": windows::post_to_displays(app, &arg)}),
        "displaysAction" => { windows::displays_action(app, &arg); json!({"ok": true}) }
        "openFeed" => { windows::open_feed(app, &arg); json!({"ok": true}) }
        "closeFeed" => { windows::close(app, "feed", true); json!({"ok": true}) }
        "relayClientCount" => json!(state.relay.client_count()),
        "fetchText" => fetch_text(&arg),
        "listDevices" => json!(discovery::fresh_peers(state).iter().map(|p| json!({
            "id": p.id, "name": p.name, "ip": p.ip, "port": p.port, "receiving": p.receiving
        })).collect::<Vec<_>>()),
        "getReceiver" => json!({
            "enabled": state.receiver_enabled.load(Ordering::SeqCst),
            "code": state.pair_code,
            "name": state.device_name.lock().unwrap().clone(),
            "id": state.instance_id
        }),
        "setReceiver" => {
            let on = arg["enabled"].as_bool().unwrap_or(false);
            state.receiver_enabled.store(on, Ordering::SeqCst);
            if let Some(n) = arg["name"].as_str() { let n: String = n.trim().chars().take(60).collect(); if !n.is_empty() { *state.device_name.lock().unwrap() = n; } }
            if !on { windows::close(app, "remote", false); }
            json!({"ok": true})
        }
        "getBrowserDisplay" => {
            let bp = state.browser_port.load(Ordering::SeqCst);
            json!({"port": bp, "urls": lan_addresses().iter().map(|a| format!("http://{}:{}/display.html", a, bp)).collect::<Vec<_>>(),
                   "monitorUrls": lan_addresses().iter().map(|a| format!("http://{}:{}/monitor.html", a, bp)).collect::<Vec<_>>(),
                   "stageUrls": lan_addresses().iter().map(|a| format!("http://{}:{}/stage.html", a, bp)).collect::<Vec<_>>(),
                   "mediaUrls": lan_addresses().iter().map(|a| format!("http://{}:{}/media.html", a, bp)).collect::<Vec<_>>()})
        }
        "listJoins" => {
            let now = std::time::Instant::now();
            let joins = state.joins.lock().unwrap();
            let allowed = state.allowed_ips.lock().unwrap().clone();
            let mut v: Vec<_> = joins.values().filter(|j| now.duration_since(j.seen).as_secs() < 600).cloned().collect();
            v.sort_by_key(|j| j.at);
            json!({"joins": v.iter().map(|j| json!({"sid": j.sid, "ip": j.ip, "name": j.name, "status": j.status, "role": j.role,
                       "live": now.duration_since(j.seen).as_secs() < 8})).collect::<Vec<_>>(),
                   "allowed": allowed})
        }
        "allowIp" => {
            // Pick a laptop from the list: its browser is let in without asking, as this role
            let ip = arg["ip"].as_str().unwrap_or("").to_string();
            let role = match arg["role"].as_str() { Some("monitor") => "monitor", Some("stage") => "stage", _ => "live" };
            if ip.parse::<std::net::Ipv4Addr>().map(|a| !a.is_private()).unwrap_or(true) { return err("Only computers on your own network can be used"); }
            if arg["allow"].as_bool().unwrap_or(true) {
                state.allowed_ips.lock().unwrap().insert(ip.clone(), role.to_string());
                // a page already waiting from that laptop is let in now
                for j in state.joins.lock().unwrap().values_mut() { if j.ip == ip && j.status == "pending" { j.status = "approved".into(); j.role = role.into(); } }
            } else {
                state.allowed_ips.lock().unwrap().remove(&ip);
                let sids: Vec<String> = state.joins.lock().unwrap().values_mut().filter(|j| j.ip == ip).map(|j| { j.status = "revoked".into(); j.sid.clone() }).collect();
                for s in sids { state.relay.kick_sid(&s); }
            }
            json!({"ok": true})
        }
        "decideJoin" => {
            let sid = arg["sid"].as_str().unwrap_or("").to_string();
            let action = arg["action"].as_str().unwrap_or("");
            let mut joins = state.joins.lock().unwrap();
            let Some(j) = joins.get_mut(&sid) else { return err("That laptop is no longer waiting"); };
            match action {
                "approve" => { j.status = "approved".into(); j.role = match arg["role"].as_str() { Some("monitor") => "monitor".into(), Some("stage") => "stage".into(), _ => "live".into() }; }
                "deny" => j.status = "denied".into(),
                _ => { j.status = "revoked".into(); drop(joins); state.relay.kick_sid(&sid); return json!({"ok": true}); }
            }
            json!({"ok": true})
        }
        "scanNetwork" => scan_network(state),
        "closeRemote" => { windows::close(app, "remote", false); json!({"ok": true}) }
        "connectDevice" => connect_device(state, &arg, true),
        "disconnectDevice" => connect_device(state, &arg, false),
        "isFeedOpen" => json!(app.get_webview_window("feed").is_some()),
        "setWindowMuted" => {
            let label = arg["label"].as_str().filter(|l| ["main", "feed", "wall"].contains(l)).unwrap_or("main");
            json!({"ok": windows::set_muted(app, label, arg["muted"].as_bool().unwrap_or(false))})
        }
        "setFeedMuted" => json!({"ok": windows::set_muted(app, "feed", arg["muted"].as_bool().unwrap_or(false))}),
        "sendOutputMessage" => {
            // { message, target } from the page; a bare message goes to both windows
            if arg["message"].is_object() { json!({"ok": windows::post_to_outputs(app, &arg["message"], arg["target"].as_str())}) }
            else { json!({"ok": windows::post_to_outputs(app, &arg, None)}) }
        }
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
        "getRemote" => {
            let bp = state.browser_port.load(Ordering::SeqCst);
            json!({"enabled": state.remote_enabled.load(Ordering::SeqCst), "key": state.remote_key,
                   "urls": lan_addresses().iter().map(|a| format!("http://{}:{}/remote.html?k={}", a, bp, state.remote_key)).collect::<Vec<_>>()})
        }
        "setRemoteEnabled" => { state.remote_enabled.store(arg["enabled"].as_bool().unwrap_or(false), Ordering::SeqCst); json!({"ok": true}) }
        "pollRemote" => { let mut q = state.remote_queue.lock().unwrap(); let v: Vec<String> = q.drain(..).collect(); json!(v) }
        "setRemoteState" => { *state.remote_state.lock().unwrap() = arg.to_string(); json!({"ok": true}) }
        "getAppInfo" => json!({"version": app.package_info().version.to_string(), "build": option_env!("SP_BUILD").unwrap_or("0")}),
        // The newest published release, for the "update available" notice (this address only)
        "checkUpdate" => {
            let agent = ureq::AgentBuilder::new().timeout(std::time::Duration::from_secs(10)).build();
            match agent.get("https://api.github.com/repos/Joshuapavan/Scripture-Pod-V2/releases/latest").set("User-Agent", "scripture-pod").set("Accept", "application/vnd.github+json").call() {
                Ok(resp) => {
                    let v: Value = serde_json::from_str(&resp.into_string().unwrap_or_default()).unwrap_or(Value::Null);
                    json!({"tag": v["tag_name"], "name": v["name"], "url": v["html_url"], "asset": pick_asset(&v["assets"])})
                }
                Err(e) => err(&format!("Could not check for updates: {}", e)),
            }
        }
        "startUpdateDownload" => start_update_download(app, &arg),
        "getUpdateProgress" => {
            let p = UPDATE.lock().unwrap().clone().unwrap_or_default();
            json!({"state": if p.state.is_empty() { "idle" } else { p.state.as_str() }, "received": p.received, "total": p.total, "path": p.path, "error": p.error})
        }
        "openDownloadedUpdate" => {
            // open the installer, or show it in its folder: only the file this download made
            let path = UPDATE.lock().unwrap().as_ref().map(|u| u.path.clone()).unwrap_or_default();
            if path.is_empty() { return err("Nothing has been downloaded"); }
            if arg["reveal"].as_bool().unwrap_or(false) { let _ = app.opener().reveal_item_in_dir(&path); } else { let _ = app.opener().open_path(&path, None::<&str>); }
            json!({"ok": true})
        }
        "openReleasePage" => {
            let url = arg.as_str().unwrap_or("");
            if url == "https://github.com/Joshuapavan" || url.starts_with("https://github.com/Joshuapavan/") { let _ = app.opener().open_url(url, None::<&str>); json!({"ok": true}) } else { err("That address is not allowed") }
        }
        "pickFolder" => {
            let picked = app.dialog().file().set_title("Choose a folder for automatic backups").blocking_pick_folder();
            match picked.and_then(|p| p.into_path().ok()) {
                Some(p) => json!({"path": p.to_string_lossy()}),
                None => json!({"canceled": true}),
            }
        }
        // Automatic backups: write a file into the chosen folder and keep only the newest few
        "writeBackupFile" => {
            let (folder, name, keep) = (arg["folder"].as_str().unwrap_or(""), arg["filename"].as_str().unwrap_or(""), arg["keep"].as_u64().unwrap_or(10).clamp(1, 100) as usize);
            let Some(contents) = arg["contents"].as_str() else { return err("Backup contents must be text"); };
            let dir = PathBuf::from(folder);
            if folder.is_empty() || !dir.is_dir() { return err("The backup folder is not available"); }
            if name.is_empty() || name.contains('/') || name.contains('\\') || !name.ends_with(".json") { return err("Invalid file name"); }
            let path = dir.join(name);
            if let Err(e) = fs::write(&path, contents) { return err(&e.to_string()); }
            let mut files: Vec<_> = fs::read_dir(&dir).map(|rd| rd.flatten().filter(|e| {
                let n = e.file_name().to_string_lossy().to_string(); n.starts_with("ScripturePodPro_Backup_") && n.ends_with(".json")
            }).collect()).unwrap_or_default();
            files.sort_by_key(|e| e.file_name());
            while files.len() > keep { let old = files.remove(0); let _ = fs::remove_file(old.path()); }
            json!({"ok": true, "filePath": path.to_string_lossy(), "bytesWritten": fs::metadata(&path).map(|m| m.len()).unwrap_or(0)})
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
        // Development harness only: run JS in the output window (result goes to the log)
        #[cfg(any(debug_assertions, feature = "harness"))]
        "evalOutput" => {
            if let Some(w) = app.get_webview_window("output") {
                let js = arg.as_str().unwrap_or("");
                let _ = w.eval(&format!("(async()=>{{try{{const r=await (async()=>{{{}}})();await fetch('/__bsp/log?label=out',{{method:'POST',body:JSON.stringify(JSON.stringify(r))}});}}catch(e){{await fetch('/__bsp/log?label=out',{{method:'POST',body:JSON.stringify('ERR '+e.message)}});}}}})()", js));
            }
            json!(true)
        }
        #[cfg(any(debug_assertions, feature = "harness"))]
        "devWrite" => { let ok = fs::write(arg["path"].as_str().unwrap_or("/tmp/dev-write"), arg["contents"].as_str().unwrap_or("")).is_ok(); json!({"ok": ok}) }
        #[cfg(any(debug_assertions, feature = "harness"))]
        "devRead" => json!({"contents": fs::read_to_string(arg.as_str().unwrap_or("")).unwrap_or_default()}),
        // Development harness only: run JS in the output window (result goes to the log)
        #[cfg(any(debug_assertions, feature = "harness"))]
        "evalFeed" => {
            if let Some(w) = app.get_webview_window("feed") {
                let js = arg.as_str().unwrap_or("");
                let _ = w.eval(&format!("(async()=>{{try{{const r=await (async()=>{{{}}})();await fetch('/__bsp/log?label=feed',{{method:'POST',body:JSON.stringify(JSON.stringify(r))}});}}catch(e){{await fetch('/__bsp/log?label=feed',{{method:'POST',body:JSON.stringify('ERR '+e.message)}});}}}})()", js));
            }
            json!(true)
        }
        #[cfg(any(debug_assertions, feature = "harness"))]
        "evalStage" => {
            if let Some(w) = app.get_webview_window("stage") {
                let js = arg.as_str().unwrap_or("");
                let _ = w.eval(&format!("(async()=>{{try{{const r=await (async()=>{{{}}})();await fetch('/__bsp/log?label=stage',{{method:'POST',body:JSON.stringify(JSON.stringify(r))}});}}catch(e){{await fetch('/__bsp/log?label=stage',{{method:'POST',body:JSON.stringify('ERR '+e.message)}});}}}})()", js));
            }
            json!(true)
        }
        #[cfg(any(debug_assertions, feature = "harness"))]
        "devWrite" => { let ok = fs::write(arg["path"].as_str().unwrap_or("/tmp/dev-write"), arg["contents"].as_str().unwrap_or("")).is_ok(); json!({"ok": ok}) }
        #[cfg(any(debug_assertions, feature = "harness"))]
        "devRead" => json!({"contents": fs::read_to_string(arg.as_str().unwrap_or("")).unwrap_or_default()}),
        "log" => {
            #[cfg(any(debug_assertions, feature = "harness"))]
            println!("[page:{}] {}", label, arg);
            json!(true)
        }
        "outputReady" => { if label == "output" || label == "feed" { windows::emit_main(app, "output-ready"); } json!(true) }
        _ => err("unknown call"),
    }
}

// A video that stays where it is on disk: it is served to the wall window by the local server
fn register_media_file(state: &Arc<AppState>, path: &str) -> Value {
    let p = PathBuf::from(path);
    let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    let mime = match ext.as_str() { "mp4" | "m4v" => "video/mp4", "mov" => "video/quicktime", "webm" => "video/webm", "mkv" => "video/x-matroska", "ogv" => "video/ogg", "html" | "htm" => "text/html; charset=utf-8", _ => return json!({"error": "Only videos and web pages can be used"}) };
    if !p.is_file() { return json!({"error": "That video was moved or deleted"}); }
    let existing = state.media.lock().unwrap().iter().find(|(_, (q, _))| *q == p).map(|(k, _)| k.clone());
    let id = existing.unwrap_or_else(|| { let id = uuid_v4(); state.media.lock().unwrap().insert(id.clone(), (p.clone(), mime.to_string())); id });
    let host = local_server_info(state)["preferredHost"].as_str().unwrap_or("127.0.0.1").to_string();
    json!({"url": format!("http://{}:{}/background-media/{}", host, state.http_port.load(Ordering::SeqCst), id)})
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
