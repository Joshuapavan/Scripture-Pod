// HTTP server for OBS browser sources and remote displays (with port fallback).
use crate::state::*;
use std::{fs, io::{Read, Seek, SeekFrom}, sync::{atomic::Ordering, Arc}, thread};
use tiny_http::{Header, Response, Server};

fn header(k: &str, v: &str) -> Header { Header::from_bytes(k.as_bytes(), v.as_bytes()).unwrap() }

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

fn handle(req: tiny_http::Request, state: &AppState) {
    let full = req.url().to_string();
    let (path, query) = full.split_once('?').map(|(p, q)| (p.to_string(), format!("?{}", q))).unwrap_or((full.clone(), String::new()));
    if let Some(id) = path.strip_prefix("/background-media/") { return media(req, state, id); }
    if path == "/UI/scripture-pod-display.html" {
        let _ = req.respond(Response::empty(302).with_header(header("Location", &format!("/{}{}", DISPLAY_PAGE, query))));
        return;
    }
    let rel = percent_decode(if path == "/" { DISPLAY_PAGE } else { &path });
    match resolve_app_file(&state.root, &rel).and_then(|p| fs::read(&p).ok().map(|d| (p, d))) {
        Some((p, data)) => { let _ = req.respond(Response::from_data(data).with_header(header("Content-Type", content_type(&p)))); }
        None => { let _ = req.respond(Response::from_string("Not found").with_status_code(404)); }
    }
}

fn media(req: tiny_http::Request, state: &AppState, id: &str) {
    let entry = state.media.lock().unwrap().get(id).cloned();
    let Some((path, mime)) = entry else { let _ = req.respond(Response::from_string("Media not found").with_status_code(404)); return; };
    let Ok(mut f) = fs::File::open(&path) else { let _ = req.respond(Response::from_string("Media unavailable").with_status_code(404)); return; };
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
        vec![header("Accept-Ranges", "bytes"), header("Cache-Control", "private, max-age=3600"), header("Content-Type", &mime)],
        f.take(len), Some(len as usize), None);
    if partial { resp = resp.with_header(header("Content-Range", &format!("bytes {}-{}/{}", start, end, size))); }
    let _ = req.respond(resp);
}
