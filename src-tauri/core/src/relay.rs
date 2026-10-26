// WebSocket relay for remote displays: every message from one client goes to
// the others, and the panel can broadcast to all. A per-run token is required.
use std::{io::ErrorKind, net::{TcpListener, TcpStream}, sync::{atomic::{AtomicU64, Ordering}, mpsc, Arc, Mutex}, thread, time::Duration};
use tungstenite::{handshake::server::{ErrorResponse, Request, Response}, Message};

// Tells whether a browser join (the "sid" of a display opened without the app) is approved
pub type SidCheck = Arc<dyn Fn(&str) -> bool + Send + Sync>;
const KICK: &str = "\u{1}KICK";

#[derive(Default)]
pub struct Relay {
    clients: Mutex<Vec<(u64, mpsc::Sender<String>)>>,
    sids: Mutex<Vec<(u64, String)>>,
    sid_check: Mutex<Option<SidCheck>>,
    next: AtomicU64,
}

impl Relay {
    pub fn set_sid_check(&self, check: SidCheck) { *self.sid_check.lock().unwrap() = Some(check); }
    // Disconnect the browser that joined with this sid
    pub fn kick_sid(&self, sid: &str) {
        let ids: Vec<u64> = self.sids.lock().unwrap().iter().filter(|(_, s)| s == sid).map(|(i, _)| *i).collect();
        let clients = self.clients.lock().unwrap();
        for (id, tx) in clients.iter() { if ids.contains(id) { let _ = tx.send(KICK.to_string()); } }
    }
    pub fn client_count(&self) -> usize { self.clients.lock().unwrap().len() }
    pub fn broadcast(&self, msg: &str, except: Option<u64>) {
        let mut clients = self.clients.lock().unwrap();
        clients.retain(|(id, tx)| Some(*id) == except || tx.send(msg.to_string()).is_ok());
    }
}

fn query_value(uri: &str, key: &str) -> String {
    let prefix = format!("{}=", key);
    uri.split_once('?').map(|(_, q)| q).unwrap_or("").split('&').find_map(|kv| kv.strip_prefix(prefix.as_str())).unwrap_or("").to_string()
}

fn token_ok(uri: &str, expected: &str) -> bool {
    let supplied = uri.split_once('?').map(|(_, q)| q).unwrap_or("").split('&')
        .find_map(|kv| kv.strip_prefix("token=")).unwrap_or("");
    let (a, b) = (supplied.as_bytes(), expected.as_bytes());
    a.len() == b.len() && !b.is_empty() && a.iter().zip(b).fold(0u8, |d, (x, y)| d | (x ^ y)) == 0
}

pub fn start(relay: Arc<Relay>, token: String, preferred: u16) -> Option<u16> {
    for port in preferred..preferred + 20 {
        if let Ok(listener) = TcpListener::bind(("0.0.0.0", port)) {
            thread::spawn(move || {
                for stream in listener.incoming().flatten() {
                    let (relay, token) = (relay.clone(), token.clone());
                    thread::spawn(move || serve(stream, relay, token));
                }
            });
            return Some(port);
        }
    }
    eprintln!("Scripture Pod: the local relay server could not start");
    None
}

fn serve(stream: TcpStream, relay: Arc<Relay>, token: String) {
    let sid_slot = Arc::new(Mutex::new(String::new()));
    let (relay_c, slot) = (relay.clone(), sid_slot.clone());
    let check = move |req: &Request, resp: Response| -> Result<Response, ErrorResponse> {
        let uri = req.uri().to_string();
        let deny = || Err(tungstenite::http::Response::builder().status(401).body(Some("Unauthorized".to_string())).unwrap());
        if !token_ok(&uri, &token) { return deny(); }
        // A browser that joined through the display address must have been allowed from the controlling app
        let sid = query_value(&uri, "sid");
        if !sid.is_empty() {
            let ok = relay_c.sid_check.lock().unwrap().as_ref().map(|f| f(&sid)).unwrap_or(false);
            if !ok { return deny(); }
            *slot.lock().unwrap() = sid;
        }
        Ok(resp)
    };
    let mut ws = match tungstenite::accept_hdr(stream, check) { Ok(ws) => ws, Err(_) => return };
    let _ = ws.get_ref().set_read_timeout(Some(Duration::from_millis(40)));
    let id = relay.next.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = mpsc::channel::<String>();
    relay.clients.lock().unwrap().push((id, tx));
    let sid = sid_slot.lock().unwrap().clone();
    if !sid.is_empty() { relay.sids.lock().unwrap().push((id, sid)); }
    loop {
        while let Ok(m) = rx.try_recv() {
            if m == KICK { let _ = ws.close(None); return remove(&relay, id); }
            if ws.send(Message::text(m)).is_err() { return remove(&relay, id); }
        }
        match ws.read() {
            Ok(Message::Text(t)) => relay.broadcast(&t, Some(id)),
            Ok(Message::Binary(b)) => relay.broadcast(&String::from_utf8_lossy(&b), Some(id)),
            Ok(Message::Close(_)) => break,
            Ok(_) => {}
            Err(tungstenite::Error::Io(e)) if matches!(e.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => {}
            Err(_) => break,
        }
    }
    remove(&relay, id);
}

fn remove(relay: &Relay, id: u64) {
    relay.clients.lock().unwrap().retain(|(i, _)| *i != id);
    relay.sids.lock().unwrap().retain(|(i, _)| *i != id);
}

#[cfg(test)]
mod tests {
    use super::token_ok;

    #[test]
    fn token_must_match_exactly() {
        assert!(token_ok("/?token=abc123", "abc123"));
        assert!(token_ok("/?x=1&token=abc123", "abc123"));
        assert!(!token_ok("/", "abc123"));
        assert!(!token_ok("/?token=abc124", "abc123"));
        assert!(!token_ok("/?token=abc1234", "abc123"));
        assert!(!token_ok("/?token=", ""));
    }
}
