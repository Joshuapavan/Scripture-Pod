use crate::search;
use rand::RngCore;
use std::{collections::HashMap, path::PathBuf, sync::{atomic::{AtomicBool, AtomicU16}, Arc, Mutex}, time::Instant};

pub const DISPLAY_PAGE: &str = "src/renderer/display/display.html";
pub const PANEL_PAGE: &str = "src/renderer/panel/panel.html";

// Another computer running Scripture Pod on the same network, seen in its beacons
#[derive(Clone)]
pub struct Peer {
    pub id: String,
    pub name: String,
    pub ip: String,
    pub port: u16,
    pub receiving: bool,
    pub last_seen: Instant,
}

// A browser on another computer that opened the display address (no app needed there)
#[derive(Clone)]
pub struct Join {
    pub sid: String,
    pub ip: String,
    pub name: String,
    pub status: String, // pending | approved | denied | revoked
    pub role: String,   // live | monitor
    pub at: Instant,
    pub seen: Instant,
}

pub type Joins = Arc<Mutex<HashMap<String, Join>>>;

// Called when another computer asks this one to show its display (Some(url)) or to stop (None)
pub type ConnectHandler = Arc<dyn Fn(Option<String>) + Send + Sync>;

pub struct AppState {
    pub instance_id: String,
    pub device_name: Mutex<String>,
    pub receiver_enabled: AtomicBool,
    pub pair_code: String,
    pub peers: Mutex<HashMap<String, Peer>>,
    pub browser_port: AtomicU16,
    pub joins: Joins,
    // Computers picked in the controlling app: their browser is let in without asking, as this role
    pub allowed_ips: Mutex<HashMap<String, String>>,
    pub on_connect: Mutex<Option<ConnectHandler>>,
    pub root: PathBuf,
    pub db: Mutex<rusqlite::Connection>,
    pub relay: Arc<crate::relay::Relay>,
    pub token: String,
    pub http_port: AtomicU16,
    pub relay_port: AtomicU16,
    pub media: Mutex<HashMap<String, (PathBuf, String)>>,
    pub media_dir: Mutex<Option<PathBuf>>,
}

impl AppState {
    pub fn new(root: PathBuf, data_dir: PathBuf) -> Self {
        AppState {
            instance_id: random_hex(6),
            device_name: Mutex::new(String::new()),
            receiver_enabled: AtomicBool::new(false),
            pair_code: format!("{:06}", rand::random::<u32>() % 1_000_000),
            peers: Mutex::new(HashMap::new()),
            browser_port: AtomicU16::new(0),
            joins: Arc::new(Mutex::new(HashMap::new())),
            allowed_ips: Mutex::new(HashMap::new()),
            on_connect: Mutex::new(None),
            root,
            db: Mutex::new(search::open(&data_dir.join("bible-search.sqlite"))),
            relay: Arc::new(crate::relay::Relay::default()),
            token: random_hex(32),
            http_port: AtomicU16::new(0),
            relay_port: AtomicU16::new(0),
            media: Mutex::new(HashMap::new()),
            media_dir: Mutex::new(None),
        }
    }
}

pub fn random_hex(bytes: usize) -> String {
    let mut b = vec![0u8; bytes];
    rand::thread_rng().fill_bytes(&mut b);
    b.iter().map(|x| format!("{:02x}", x)).collect()
}

pub fn uuid_v4() -> String {
    let mut b = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    let h: String = b.iter().map(|x| format!("{:02x}", x)).collect();
    format!("{}-{}-{}-{}-{}", &h[0..8], &h[8..12], &h[12..16], &h[16..20], &h[20..32])
}

pub fn content_type(p: &std::path::Path) -> &'static str {
    match p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase().as_str() {
        "html" => "text/html; charset=utf-8",
        "js" => "application/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "woff2" => "font/woff2",
        "mov" => "video/quicktime",
        "mp4" => "video/mp4",
        "xml" => "application/xml; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        _ => "application/octet-stream",
    }
}

// Only what the pages load: never the whole project folder
pub fn resolve_app_file(root: &std::path::Path, rel: &str) -> Option<PathBuf> {
    let rel = rel.trim_start_matches('/');
    let allowed = ["src", "assets/bg", "assets/logo", "build", "node_modules/qrcode-generator/dist"];
    let dir = allowed.iter().find(|a| rel.starts_with(&format!("{}/", a)))?;
    let base = root.join(dir).canonicalize().ok()?;
    let target = root.join(rel).canonicalize().ok()?;
    // Resolved path must stay inside the allowed folder (blocks ../ escapes)
    if target.starts_with(&base) && target.is_file() { Some(target) } else { None }
}

pub fn percent_decode(s: &str) -> String {
    let b = s.as_bytes(); let mut out = Vec::with_capacity(b.len()); let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() + 0 + 1 && i + 2 <= b.len() - 1 {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) { out.push(v); i += 3; continue; }
        }
        out.push(b[i]); i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serves_only_allowed_folders_and_blocks_escapes() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().parent().unwrap().to_path_buf();
        assert!(resolve_app_file(&root, "src/renderer/display/display.html").is_some());
        assert!(resolve_app_file(&root, "package.json").is_none());
        assert!(resolve_app_file(&root, "src/../package.json").is_none());
        assert!(resolve_app_file(&root, "assets/bibles/EnglishNKJBible.xml").is_none());
    }

    #[test]
    fn ids_look_right() {
        assert_eq!(uuid_v4().len(), 36);
        assert_eq!(random_hex(32).len(), 64);
        assert_eq!(percent_decode("a%20b%E2%9C%93"), "a b✓");
    }
}
