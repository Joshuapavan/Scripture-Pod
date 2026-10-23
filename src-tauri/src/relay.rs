// WebSocket relay for remote displays: every message from one client goes to
// the others, and the panel can broadcast to all. A per-run token is required.
use std::{io::ErrorKind, net::{TcpListener, TcpStream}, sync::{atomic::{AtomicU64, Ordering}, mpsc, Arc, Mutex}, thread, time::Duration};
use tungstenite::{handshake::server::{ErrorResponse, Request, Response}, Message};

#[derive(Default)]
pub struct Relay {
    clients: Mutex<Vec<(u64, mpsc::Sender<String>)>>,
    next: AtomicU64,
}

impl Relay {
    pub fn broadcast(&self, msg: &str, except: Option<u64>) {
        let mut clients = self.clients.lock().unwrap();
        clients.retain(|(id, tx)| Some(*id) == except || tx.send(msg.to_string()).is_ok());
    }
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
    let check = move |req: &Request, resp: Response| -> Result<Response, ErrorResponse> {
        if token_ok(&req.uri().to_string(), &token) { Ok(resp) }
        else { Err(tungstenite::http::Response::builder().status(401).body(Some("Unauthorized".to_string())).unwrap()) }
    };
    let mut ws = match tungstenite::accept_hdr(stream, check) { Ok(ws) => ws, Err(_) => return };
    let _ = ws.get_ref().set_read_timeout(Some(Duration::from_millis(40)));
    let id = relay.next.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = mpsc::channel::<String>();
    relay.clients.lock().unwrap().push((id, tx));
    loop {
        while let Ok(m) = rx.try_recv() { if ws.send(Message::text(m)).is_err() { return remove(&relay, id); } }
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

fn remove(relay: &Relay, id: u64) { relay.clients.lock().unwrap().retain(|(i, _)| *i != id); }

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
