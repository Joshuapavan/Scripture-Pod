// Finding other computers running Scripture Pod on the same network.
// Every copy sends a small beacon (its name, port and whether it accepts a projection) to the local
// network every two seconds and listens for the beacons of the others.
use crate::state::*;
use serde_json::{json, Value};
use std::{net::{IpAddr, Ipv4Addr, SocketAddr, UdpSocket}, sync::{atomic::Ordering, Arc}, thread, time::{Duration, Instant}};

pub const DISCOVERY_PORT: u16 = 5530;
const BEACON_EVERY: Duration = Duration::from_secs(2);
pub const PEER_FRESH: Duration = Duration::from_secs(8);

fn beacon(state: &AppState) -> Vec<u8> {
    json!({
        "app": "scripture-pod", "v": 1,
        "id": state.instance_id,
        "name": state.device_name.lock().unwrap().clone(),
        "port": state.http_port.load(Ordering::SeqCst),
        "receiving": state.receiver_enabled.load(Ordering::SeqCst),
    }).to_string().into_bytes()
}

fn broadcast_targets() -> Vec<Ipv4Addr> {
    let mut v: Vec<Ipv4Addr> = if_addrs::get_if_addrs().unwrap_or_default().into_iter()
        .filter(|i| !i.is_loopback())
        .filter_map(|i| match i.addr { if_addrs::IfAddr::V4(a) => a.broadcast, _ => None })
        .collect();
    v.push(Ipv4Addr::new(255, 255, 255, 255));
    v.sort(); v.dedup();
    v
}

pub fn start(state: Arc<AppState>) {
    // Sender
    let s = state.clone();
    thread::spawn(move || {
        let Ok(sock) = UdpSocket::bind("0.0.0.0:0") else { return };
        let _ = sock.set_broadcast(true);
        loop {
            let data = beacon(&s);
            for t in broadcast_targets() { let _ = sock.send_to(&data, SocketAddr::new(IpAddr::V4(t), DISCOVERY_PORT)); }
            thread::sleep(BEACON_EVERY);
        }
    });
    // Listener
    thread::spawn(move || {
        let Ok(sock) = UdpSocket::bind(("0.0.0.0", DISCOVERY_PORT)) else {
            eprintln!("Scripture Pod: other computers cannot be listed (the discovery port is busy)");
            return;
        };
        let mut buf = [0u8; 1024];
        loop {
            let Ok((n, from)) = sock.recv_from(&mut buf) else { continue };
            let Ok(v) = serde_json::from_slice::<Value>(&buf[..n]) else { continue };
            if v["app"] != "scripture-pod" { continue; }
            let id = v["id"].as_str().unwrap_or("").to_string();
            let port = v["port"].as_u64().unwrap_or(0) as u16;
            if id.is_empty() || id == state.instance_id || port == 0 { continue; }
            let peer = Peer {
                id: id.clone(),
                name: v["name"].as_str().unwrap_or("").chars().take(60).collect(),
                ip: from.ip().to_string(),
                port,
                receiving: v["receiving"].as_bool().unwrap_or(false),
                last_seen: Instant::now(),
            };
            state.peers.lock().unwrap().insert(id, peer);
        }
    });
}

// Computers seen in the last few seconds
pub fn fresh_peers(state: &AppState) -> Vec<Peer> {
    let mut peers = state.peers.lock().unwrap();
    peers.retain(|_, p| p.last_seen.elapsed() < PEER_FRESH * 3);
    let mut v: Vec<Peer> = peers.values().filter(|p| p.last_seen.elapsed() < PEER_FRESH).cloned().collect();
    v.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    v
}
