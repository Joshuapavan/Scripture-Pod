// Finding the name of a device on the network from its address, with no software on it.
// Three ways, in order: the router or system (reverse DNS), Windows (NetBIOS) and Apple, Linux and
// phones (multicast DNS). The first answer wins; a device that answers none is shown by its address.
use std::{net::{IpAddr, Ipv4Addr, SocketAddr, UdpSocket}, sync::mpsc, thread, time::Duration};

fn clean(name: &str, ip: &str) -> String {
    let first = name.trim().trim_end_matches('.').split('.').next().unwrap_or("").trim().to_string();
    if first.is_empty() || first == ip || first.parse::<Ipv4Addr>().is_ok() { String::new() } else { first }
}

fn reverse_dns(ip: Ipv4Addr) -> String {
    dns_lookup::lookup_addr(&IpAddr::V4(ip)).map(|n| clean(&n, &ip.to_string())).unwrap_or_default()
}

// NetBIOS node status: Windows computers and many printers and NAS boxes answer with their name
fn netbios(ip: Ipv4Addr) -> String {
    let Ok(sock) = UdpSocket::bind("0.0.0.0:0") else { return String::new() };
    let _ = sock.set_read_timeout(Some(Duration::from_millis(900)));
    let mut q = vec![0x13, 0x37, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0x20];
    q.extend_from_slice(b"CKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    q.extend_from_slice(&[0, 0, 0x21, 0, 1]);
    if sock.send_to(&q, SocketAddr::new(IpAddr::V4(ip), 137)).is_err() { return String::new(); }
    let mut buf = [0u8; 600];
    let Ok((n, _)) = sock.recv_from(&mut buf) else { return String::new() };
    if n < 58 { return String::new(); }
    let count = buf[56] as usize;
    for i in 0..count {
        let at = 57 + i * 18;
        if at + 18 > n { break; }
        let flags = u16::from_be_bytes([buf[at + 16], buf[at + 17]]);
        if buf[at + 15] == 0 && flags & 0x8000 == 0 {
            return String::from_utf8_lossy(&buf[at..at + 15]).trim().to_string();
        }
    }
    String::new()
}

fn read_name(buf: &[u8], mut at: usize) -> Option<(String, usize)> {
    let mut out: Vec<String> = Vec::new();
    let mut end = None;
    for _ in 0..40 {
        let len = *buf.get(at)? as usize;
        if len == 0 { return Some((out.join("."), end.unwrap_or(at + 1))); }
        if len & 0xC0 == 0xC0 {
            let ptr = ((len & 0x3F) << 8) | *buf.get(at + 1)? as usize;
            if end.is_none() { end = Some(at + 2); }
            at = ptr;
            continue;
        }
        out.push(String::from_utf8_lossy(buf.get(at + 1..at + 1 + len)?).to_string());
        at += 1 + len;
    }
    None
}

// Multicast DNS reverse lookup: asks "who is <ip>?" and accepts a direct reply
fn mdns(ip: Ipv4Addr) -> String {
    let Ok(sock) = UdpSocket::bind("0.0.0.0:0") else { return String::new() };
    let _ = sock.set_read_timeout(Some(Duration::from_millis(1100)));
    let o = ip.octets();
    let mut q = vec![0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0];
    for part in [o[3].to_string(), o[2].to_string(), o[1].to_string(), o[0].to_string(), "in-addr".into(), "arpa".into()] {
        q.push(part.len() as u8);
        q.extend_from_slice(part.as_bytes());
    }
    q.extend_from_slice(&[0, 0, 12, 0x80, 1]); // PTR, class IN with the "answer me directly" bit
    // straight to the device (it answers on its own address), and to the multicast group
    let _ = sock.send_to(&q, SocketAddr::new(IpAddr::V4(ip), 5353));
    let _ = sock.send_to(&q, SocketAddr::new(IpAddr::V4(Ipv4Addr::new(224, 0, 0, 251)), 5353));
    let mut buf = [0u8; 1200];
    for _ in 0..3 {
        let Ok((n, from)) = sock.recv_from(&mut buf) else { break };
        if from.ip() != IpAddr::V4(ip) || n < 12 { continue; }
        let (qd, an) = (u16::from_be_bytes([buf[4], buf[5]]) as usize, u16::from_be_bytes([buf[6], buf[7]]) as usize);
        let mut at = 12;
        for _ in 0..qd { let Some((_, next)) = read_name(&buf[..n], at) else { return String::new() }; at = next + 4; }
        for _ in 0..an {
            let Some((_, next)) = read_name(&buf[..n], at) else { break };
            if next + 10 > n { break; }
            let (rtype, rdlen) = (u16::from_be_bytes([buf[next], buf[next + 1]]), u16::from_be_bytes([buf[next + 8], buf[next + 9]]) as usize);
            if rtype == 12 { if let Some((name, _)) = read_name(&buf[..n], next + 10) { let c = clean(&name, &ip.to_string()); if !c.is_empty() { return c; } } }
            at = next + 10 + rdlen;
        }
    }
    String::new()
}

// Multicast DNS browse: Macs, phones, printers, TVs and Linux boxes announce friendly names
// ("Joshua's MacBook Pro") for the services they offer. Returns what each address called itself.
pub fn mdns_browse() -> std::collections::HashMap<String, String> {
    let mut names = std::collections::HashMap::new();
    let Ok(sock) = UdpSocket::bind("0.0.0.0:0") else { return names };
    let _ = sock.set_read_timeout(Some(Duration::from_millis(400)));
    for service in ["_device-info._tcp", "_workstation._tcp", "_companion-link._tcp", "_airplay._tcp", "_smb._tcp", "_sftp-ssh._tcp", "_googlecast._tcp", "_ipp._tcp"] {
        let mut q = vec![0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0];
        for part in service.split('.').chain(["local"]) { q.push(part.len() as u8); q.extend_from_slice(part.as_bytes()); }
        q.extend_from_slice(&[0, 0, 12, 0x80, 1]);
        let _ = sock.send_to(&q, SocketAddr::new(IpAddr::V4(Ipv4Addr::new(224, 0, 0, 251)), 5353));
    }
    let deadline = std::time::Instant::now() + Duration::from_millis(1800);
    let mut buf = [0u8; 2000];
    while std::time::Instant::now() < deadline {
        let Ok((n, from)) = sock.recv_from(&mut buf) else { continue };
        if n < 12 { continue; }
        let b = &buf[..n];
        let (qd, an) = (u16::from_be_bytes([b[4], b[5]]) as usize, u16::from_be_bytes([b[6], b[7]]) as usize + u16::from_be_bytes([b[10], b[11]]) as usize);
        let mut at = 12;
        let mut ok = true;
        for _ in 0..qd { match read_name(b, at) { Some((_, next)) => at = next + 4, None => { ok = false; break; } } }
        if !ok { continue; }
        for _ in 0..an {
            let Some((_, next)) = read_name(b, at) else { break };
            if next + 10 > n { break; }
            let (rtype, rdlen) = (u16::from_be_bytes([b[next], b[next + 1]]), u16::from_be_bytes([b[next + 8], b[next + 9]]) as usize);
            if rtype == 12 {
                if let Some((instance, _)) = read_name(b, next + 10) {
                    // "Joshua's MacBook Pro._device-info._tcp.local" -> the part before the first "._"
                    let label = instance.split("._").next().unwrap_or("").replace("\\032", " ").trim().to_string();
                    if !label.is_empty() && !label.starts_with('_') { names.entry(from.ip().to_string()).or_insert(label); }
                }
            }
            at = next + 10 + rdlen;
        }
    }
    names
}

pub fn lookup(ip: Ipv4Addr) -> String {
    let n = reverse_dns(ip);
    if !n.is_empty() { return n; }
    let n = netbios(ip);
    if !n.is_empty() { return n; }
    mdns(ip)
}

// Names for many addresses at once, waiting no longer than a couple of seconds in all
pub fn lookup_many(ips: &[String]) -> Vec<(String, String)> {
    // the friendly names devices announce, found once for all of them
    let announced = thread::spawn(mdns_browse);
    let (tx, rx) = mpsc::channel();
    for ip in ips {
        let (tx, ip) = (tx.clone(), ip.clone());
        thread::spawn(move || { let name = ip.parse::<Ipv4Addr>().map(lookup).unwrap_or_default(); let _ = tx.send((ip, name)); });
    }
    drop(tx);
    let deadline = std::time::Instant::now() + Duration::from_millis(3200);
    let mut out = Vec::new();
    while out.len() < ips.len() {
        let left = deadline.saturating_duration_since(std::time::Instant::now());
        match rx.recv_timeout(left) { Ok(pair) => out.push(pair), Err(_) => break }
    }
    // a name the device announced is friendlier than a host name: it wins
    if let Ok(map) = announced.join() {
        for ip in ips {
            if let Some(friendly) = map.get(ip) {
                match out.iter_mut().find(|(i, _)| i == ip) { Some(p) => p.1 = friendly.clone(), None => out.push((ip.clone(), friendly.clone())) }
            }
        }
    }
    out
}
