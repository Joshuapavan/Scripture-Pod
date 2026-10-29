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

const REMOTE_ACTIONS: [&str; 8] = ["goLive", "preview", "clear", "nextSlide", "prevSlide", "nextItem", "prevItem", "clearAll"];

const REMOTE_PAGE: &str = r##"<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>Scripture Pod remote</title>
<style>*{box-sizing:border-box}html,body{min-height:100%;margin:0;background:#0c0d0f;color:#edeef0;font:16px system-ui,sans-serif;-webkit-user-select:none;user-select:none}
main{min-height:100%;display:flex;flex-direction:column;gap:10px;padding:12px;max-width:560px;margin:0 auto}
.tabs{display:flex;gap:6px}.tabs button{flex:1;height:40px;border-radius:999px;font-size:14px}.tabs button.on{background:#edeef0;color:#0c0d0f;border-color:#edeef0}
.card{border:1px solid #23272c;border-radius:14px;padding:10px;background:#131518}.tag{display:flex;align-items:center;gap:8px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#8b9299;margin-bottom:8px}
.tag b{color:#edeef0;letter-spacing:0;text-transform:none;font-size:14px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pill{padding:2px 8px;border-radius:6px;background:#2e3339;font-size:11px;font-weight:700;color:#edeef0;letter-spacing:.04em}.pill.live{background:#e5372a}.pill.cue{background:#2f7de1}
.feed{position:relative;aspect-ratio:16/9;border-radius:10px;overflow:hidden;background:#000;border:1px solid #23272c}
.feed .txt{position:absolute;left:0;right:0;padding:4%;text-align:center;white-space:pre-line;line-height:1.25;overflow:hidden;font-size:calc(var(--w,320px)*.052)}
.feed.full .txt{top:0;bottom:0;display:flex;align-items:center;justify-content:center}.feed.lt .txt{bottom:0;background:rgba(0,0,0,.55)}
.feed .none{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#6c737b;font-size:13px}.feed .none[hidden]{display:none}
#nxt{margin-top:8px;font-size:13px;color:#a3a9b0;white-space:pre-line;max-height:9vh;overflow:hidden}
#slides{max-height:24vh;overflow:auto;display:flex;flex-direction:column;gap:4px;-webkit-user-select:none;-webkit-overflow-scrolling:touch}
.sl{flex:0 0 auto;display:flex;gap:8px;align-items:flex-start;padding:8px 10px;border-radius:10px;border:1px solid #23272c;background:#181b1f;font-size:14px;line-height:1.3;text-align:left;color:#edeef0;height:auto;min-height:0;font-weight:500}
.sl.cur{border-color:#edeef0}.sl.air{border-color:#e5372a;background:#221416}.sl i{font-style:normal;color:#8b9299;min-width:34px;font-size:11px;text-transform:uppercase;padding-top:2px}
.dock{position:sticky;bottom:0;z-index:5;background:linear-gradient(#0c0d0f00,#0c0d0f 14px);padding:14px 0 max(8px,env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:8px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}button{touch-action:manipulation;-webkit-tap-highlight-color:transparent;height:58px;border-radius:14px;border:1px solid #2e3339;background:#181b1f;color:#edeef0;font-size:16px;font-weight:600}
button:active{background:#23272c}.go{grid-column:1/3;background:#e5372a;border-color:#e5372a;height:70px;font-size:20px}
.ref{display:flex;gap:6px}.ref input{flex:1;min-width:0;height:48px;border-radius:12px;border:1px solid #2e3339;background:#101215;color:#edeef0;font-size:16px;padding:0 12px;-webkit-user-select:text;user-select:text}.ref button{height:48px;width:52px;font-size:15px}
.msg{text-align:center;color:#8b9299;font-size:13px;min-height:18px}
.conn{display:flex;align-items:center;gap:8px;font-size:12px;color:#8b9299;padding:0 4px}.conn i{width:8px;height:8px;border-radius:50%;background:#2fb170;flex:0 0 auto}.conn.off i{background:#e5372a}.conn span:first-of-type{flex:1}
.dsp{display:flex;align-items:center;gap:8px;padding:8px 0;border-top:1px solid #23272c}.dsp:first-child{border-top:0}.dsp b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:600}
.mini{height:38px;padding:0 14px;font-size:13px;border-radius:999px;flex:0 0 auto}.wb{display:flex;flex-wrap:wrap;gap:8px;margin:2px 0 8px}.wv{display:flex;flex-direction:column;gap:6px}.wv .mini{height:auto;min-height:38px;padding:8px 14px;text-align:left;border-radius:12px;font-weight:500}.pill.ok{background:#2fb170}.pill.dim{background:#2e3339;color:#a3a9b0}.pill.warn{background:#d9a016;color:#111}
@media (max-height:760px){button{height:48px;font-size:15px}.go{height:56px}.tabs button{height:38px}.mini{height:34px}}</style></head>
<body><main>
<div class="conn" id="conn"><i></i><span id="connt">Connecting…</span><span id="lock" class="pill warn" hidden>LOCKED</span></div>
<div class="tabs"><button data-t="bible">Bible</button><button data-t="songs">Lyrics</button><button data-t="schedule">Setlist</button></div>
<div class="card"><div class="tag"><b id="ttl">Scripture Pod</b><span id="lv" class="pill" hidden></span></div>
<div class="feed" id="feed"><div class="none" id="none">Connecting…</div><div class="txt" id="ftxt"></div></div><div id="nxt"></div></div>
<div class="card" id="slcard" hidden><div class="tag"><b id="sttl">Slides</b></div><div id="slides"></div></div>
<div class="card" id="dcard" hidden><div class="tag"><b>Displays</b></div><div id="dlist"></div></div>
<div class="card" id="wcard" hidden><div class="tag"><b id="wttl">Wall/LED</b><span id="wpill" class="pill dim"></span></div><div class="wb" id="wbtns"></div><div class="wv" id="wvids"></div></div>
<div class="ref"><input id="ri" type="text" placeholder="Say or type: john three sixteen" autocomplete="off" autocapitalize="off" enterkeyhint="go"><button id="rm" hidden title="Speak">🎤</button><button id="rg">Open</button></div>
<div class="msg" id="msg"></div>
<div class="dock"><div class="grid"><button data-a="prevSlide">◀ Previous</button><button data-a="nextSlide">Next ▶</button><button class="go" data-a="goLive">Go live</button>
<button data-a="clear">Clear</button><button data-a="preview">Preview only</button><button data-a="prevItem">Previous song</button><button data-a="nextItem">Next song</button></div></div></main>
<script>
(function(){var key=new URLSearchParams(location.search).get("k")||"";var $=function(i){return document.getElementById(i)};
function msg(t){$("msg").textContent=t||""}
function send(o){if(navigator.vibrate)navigator.vibrate(20);return fetch("/__remote?k="+encodeURIComponent(key),{method:"POST",body:JSON.stringify(o)}).then(function(){setTimeout(poll,250)}).catch(function(){msg("Could not send")})}
function box(){var f=$("feed");f.style.setProperty("--w",f.clientWidth+"px")}
function paintFeed(s){var f=s.live?s.feed:s.cued;var tag=$("lv");
if(s.live){tag.hidden=false;tag.textContent="LIVE";tag.className="pill live"}else if(s.cued){tag.hidden=false;tag.textContent="CUED";tag.className="pill cue"}else tag.hidden=true;
var feed=$("feed"),txt=$("ftxt");box();
if(!f||!f.text){txt.textContent="";feed.className="feed";feed.style.background="#000";$("none").hidden=false;$("none").textContent=s.live?"On air":"Nothing on screen";return}
$("none").hidden=true;feed.className="feed "+(f.mode==="lt"?"lt":"full");feed.style.background=f.mode==="lt"?"repeating-conic-gradient(#2a2c31 0% 25%,#1b1c20 0% 50%) 0 0/14px 14px":(f.bg||"#000");
txt.style.color=f.color||"#fff";txt.style.fontFamily=f.font||"inherit";txt.textContent=(f.ref?f.ref+"\n":"")+f.text}
function paintSlides(s){var card=$("slcard"),box2=$("slides");var list=s.slides||[];card.hidden=!list.length;if(!list.length)return;
$("sttl").textContent=s.itemTitle||"Slides";var sig=JSON.stringify([list,s.cursor,s.liveIndex]);if(box2.dataset.sig===sig)return;box2.dataset.sig=sig;box2.textContent="";
list.forEach(function(x,i){var b=document.createElement("button");b.className="sl"+(i===s.cursor?" cur":"")+(s.live&&i===s.liveIndex?" air":"");var t=document.createElement("i");t.textContent=x.tag||String(i+1);var p=document.createElement("span");p.textContent=x.t;b.appendChild(t);b.appendChild(p);b.addEventListener("click",function(){send({action:"goto",index:i})});box2.appendChild(b)});
var cur=box2.querySelector(".cur");if(cur&&cur.scrollIntoView)cur.scrollIntoView({block:"nearest"})}
function stat(d){return !d.open?"off":d.blank?"blank":d.live?"live":"clear"}
function paintDisplays(s){var list=(s.displays||[]).filter(function(d){return d.canBlank});var card=$("dcard"),box=$("dlist");card.hidden=!list.length;if(!list.length)return;
var sig=JSON.stringify(list);if(box.dataset.sig===sig)return;box.dataset.sig=sig;box.textContent="";
list.forEach(function(d){var row=document.createElement("div");row.className="dsp";var n=document.createElement("b");n.textContent=d.name;var st=stat(d);var p=document.createElement("span");p.className="pill "+(st==="live"?"live":st==="blank"?"warn":"dim");p.textContent=st.toUpperCase();row.appendChild(n);row.appendChild(p);
if(d.open){var b=document.createElement("button");b.className="mini";b.textContent=d.blank?"Show":"Blank";b.addEventListener("click",function(){send({action:"blank",value:d.key})});row.appendChild(b)}box.appendChild(row)})}
function paintWall(s){var w=s.wall,card=$("wcard");card.hidden=!w||!(w.open||(w.videos||[]).length);if(card.hidden)return;
var sig=JSON.stringify(w);if(card.dataset.sig===sig)return;card.dataset.sig=sig;
$("wttl").textContent=w.open?(w.name||"Wall/LED"):"Wall/LED";var pl=$("wpill");pl.textContent=w.open?(w.blank?"BLANK":"PLAYING"):"STOPPED";pl.className="pill "+(w.open?(w.blank?"warn":"ok"):"dim");
var bt=$("wbtns");bt.textContent="";function add(label,val){var b=document.createElement("button");b.className="mini";b.textContent=label;b.addEventListener("click",function(){send({action:"wall",value:val})});bt.appendChild(b)}
if(w.open){add(w.blank?"Show":"Blank","blank");add("Stop","stop")}else if(w.canResume)add("Play last again","resume");if(w.hasPlaylist)add("Play playlist","playlist");
var vb=$("wvids");vb.textContent="";(w.videos||[]).forEach(function(v){var b=document.createElement("button");b.className="mini";b.textContent=(w.playingIds&&w.playingIds.indexOf(v.id)>=0?"▶ ":"")+v.name;b.addEventListener("click",function(){send({action:"wall",value:"play:"+v.id})});vb.appendChild(b)})}
function paint(s){$("lock").hidden=!s.locked;paintDisplays(s);paintWall(s);$("ttl").textContent=s.title||"Scripture Pod";$("nxt").textContent=s.next?"Next: "+s.next:"";
document.querySelectorAll(".tabs button").forEach(function(b){b.className=b.dataset.t===s.section?"on":""});paintFeed(s);paintSlides(s);msg(s.refResult||"")}
function poll(){fetch("/__remote/state?k="+encodeURIComponent(key)).then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(s){var c=$("conn");c.className="conn";$("connt").textContent="Connected to Scripture Pod";paint(s)}).catch(function(){$("conn").className="conn off";$("connt").textContent="Not connected, trying again…";msg("Check the link and that the remote is switched on")})}
document.querySelectorAll("button[data-a]").forEach(function(b){b.addEventListener("click",function(){send({action:b.dataset.a})})});
document.querySelectorAll(".tabs button").forEach(function(b){b.addEventListener("click",function(){send({action:"tab",value:b.dataset.t})})});
function openRef(){var v=$("ri").value.trim();if(!v)return;msg("Opening…");send({action:"ref",text:v});$("ri").blur()}
$("rg").addEventListener("click",openRef);$("ri").addEventListener("keydown",function(e){if(e.key==="Enter")openRef()});
var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
if(SR&&window.isSecureContext){var mic=$("rm");mic.hidden=false;mic.addEventListener("click",function(){var r=new SR();r.lang=navigator.language||"en-US";r.onresult=function(e){$("ri").value=e.results[0][0].transcript;openRef()};r.onerror=function(){msg("Could not hear that: use the keyboard microphone instead")};try{r.start();msg("Listening…")}catch(x){}})}
window.addEventListener("resize",box);poll();setInterval(poll,1200);})();
</script></body></html>"##;

// The phone remote: a page, its state, and commands that the panel picks up. Off until switched on, key required.
fn remote_request(mut req: tiny_http::Request, state: &AppState, path: &str, query: &str) {
    let json = |code: u16, body: String| Response::from_string(body).with_status_code(code).with_header(header("Content-Type", "application/json")).with_header(header("Cache-Control", "no-store"));
    let key = query.trim_start_matches('?').split('&').find_map(|kv| kv.strip_prefix("k=")).unwrap_or("");
    let (a, b) = (key.as_bytes(), state.remote_key.as_bytes());
    let key_ok = a.len() == b.len() && a.iter().zip(b).fold(0u8, |d, (x, y)| d | (x ^ y)) == 0;
    if !state.remote_enabled.load(Ordering::SeqCst) || !key_ok { return { let _ = req.respond(json(403, r#"{"error":"Not allowed"}"#.into())); }; }
    if path == "/__remote/state" { let body = state.remote_state.lock().unwrap().clone(); return { let _ = req.respond(json(200, body)); }; }
    let mut body = String::new();
    let _ = req.as_reader().take(1024).read_to_string(&mut body);
    let v: serde_json::Value = serde_json::from_str(&body).unwrap_or(serde_json::Value::Null);
    let action = v["action"].as_str().unwrap_or("");
    // Plain actions, or one with a value: a slide to jump to, a section to open, a Bible reference to look up
    let entry: Option<String> = if REMOTE_ACTIONS.contains(&action) { Some(action.to_string()) }
        else if action == "goto" { v["index"].as_u64().filter(|i| *i < 2000).map(|i| format!("goto:{}", i)) }
        else if action == "tab" { v["value"].as_str().filter(|t| ["bible", "songs", "schedule"].contains(t)).map(|t| format!("tab:{}", t)) }
        // Blank or show one display (by its key), and control the background wall
        else if action == "blank" { v["value"].as_str().filter(|k| k.len() <= 40 && k.chars().all(|c| c.is_ascii_alphanumeric() || ":_-".contains(c))).map(|k| format!("blank:{}", k)) }
        else if action == "wall" { v["value"].as_str().filter(|k| k.len() <= 60 && k.chars().all(|c| c.is_ascii_alphanumeric() || ":_-".contains(c)) && (["playlist", "stop", "resume", "blank"].contains(k) || k.starts_with("play:"))).map(|k| format!("wall:{}", k)) }
        else if action == "ref" {
            let t: String = v["text"].as_str().unwrap_or("").chars().filter(|c| c.is_alphanumeric() || " :.'-".contains(*c)).take(80).collect();
            let t = t.trim().to_string();
            if t.is_empty() { None } else { Some(format!("ref:{}", t)) }
        } else { None };
    let Some(entry) = entry else { return { let _ = req.respond(json(400, r#"{"error":"Unknown action"}"#.into())); }; };
    let mut q = state.remote_queue.lock().unwrap();
    if q.len() < 20 { q.push(entry); }
    drop(q);
    let _ = req.respond(json(200, r#"{"ok":true}"#.into()));
}

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
        let role = allowed.clone().unwrap_or_else(|| match v["role"].as_str() { Some("monitor") => "monitor".into(), Some("stage") => "stage".into(), _ => "live".into() });
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
        let role = match j.role.as_str() { "monitor" => "&role=monitor", "stage" => "&role=stage", _ => "" };
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
    if bare == "/display.html" || bare == "/monitor.html" || bare == "/stage.html" || bare == "/join" {
        let role = match bare { "/monitor.html" => "monitor", "/stage.html" => "stage", _ => "live" };
        let page = JOIN_PAGE.replace("__ROLE__", role);
        let _ = req.respond(Response::from_string(page).with_header(header("Content-Type", "text/html; charset=utf-8")).with_header(header("Cache-Control", "no-store")));
        return;
    }
    if bare == "/__join" || bare.starts_with("/__join/") { return join_request(req, state, bare); }
    if bare == "/remote.html" {
        let _ = req.respond(Response::from_string(REMOTE_PAGE).with_header(header("Content-Type", "text/html; charset=utf-8")).with_header(header("Cache-Control", "no-store")));
        return;
    }
    if bare == "/__remote" || bare == "/__remote/state" {
        let query = full.split_once('?').map(|(_, q)| q.to_string()).unwrap_or_default();
        return remote_request(req, state, bare, &query);
    }
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
