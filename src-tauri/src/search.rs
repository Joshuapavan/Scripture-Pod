// Port of src/main/bible-search-worker.js: one FTS5 trigram table per version.
use rusqlite::{params, params_from_iter, Connection};
use serde_json::{json, Value};
use unicode_normalization::UnicodeNormalization;

const SCHEMA_VERSION: i64 = 1;

pub fn open(path: &std::path::Path) -> Connection {
    let _ = std::fs::create_dir_all(path.parent().unwrap());
    let db = Connection::open(path).expect("open search db");
    db.execute_batch("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA cache_size = -4096; PRAGMA temp_store = FILE;").ok();
    let v: i64 = db.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap_or(0);
    if v != SCHEMA_VERSION { reset(&db); }
    db
}

fn reset(db: &Connection) {
    let names: Vec<String> = db
        .prepare("SELECT name FROM sqlite_master WHERE name LIKE 'fts\\_%' ESCAPE '\\' AND type = 'table'").unwrap()
        .query_map([], |r| r.get(0)).unwrap().filter_map(|x| x.ok()).collect();
    for n in names { db.execute_batch(&format!("DROP TABLE IF EXISTS \"{}\"", n)).ok(); }
    db.execute_batch("DROP TABLE IF EXISTS versions;
        CREATE TABLE versions (vid INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, chapters INTEGER NOT NULL, verses INTEGER NOT NULL, indexed_at INTEGER NOT NULL);").ok();
    db.execute_batch(&format!("PRAGMA user_version = {}", SCHEMA_VERSION)).ok();
}

// Same normalization as the panel's normalizeSearchText
pub fn normalize(s: &str) -> String {
    let mut out = String::new();
    for ch in s.nfd() {
        let c = ch as u32;
        if (0x300..=0x36f).contains(&c) || (0x1ab0..=0x1aff).contains(&c) || (0x1dc0..=0x1dff).contains(&c)
            || (0x20d0..=0x20ff).contains(&c) || (0xfe20..=0xfe2f).contains(&c) { continue; }
        let ch = if ch == '\u{2018}' || ch == '\u{2019}' { '\'' } else { ch };
        for l in ch.to_lowercase() {
            if l.is_alphanumeric() || l == ':' { out.push(l); } else { out.push(' '); }
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn remove_version(db: &Connection, id: &str) -> bool {
    let vid: Option<i64> = db.query_row("SELECT vid FROM versions WHERE id = ?", [id], |r| r.get(0)).ok();
    match vid {
        Some(v) => {
            db.execute_batch(&format!("DROP TABLE IF EXISTS \"fts_{}\"", v)).ok();
            db.execute("DELETE FROM versions WHERE vid = ?", [v]).ok();
            true
        }
        None => false,
    }
}

pub fn call(db: &mut Connection, method: &str, p: &Value) -> Result<Value, String> {
    match method {
        "status" => {
            let mut st = db.prepare("SELECT id, chapters, verses FROM versions").map_err(|e| e.to_string())?;
            let rows = st.query_map([], |r| Ok(json!({"id": r.get::<_, String>(0)?, "chapters": r.get::<_, i64>(1)?, "verses": r.get::<_, i64>(2)?})))
                .map_err(|e| e.to_string())?.filter_map(|x| x.ok()).collect::<Vec<_>>();
            Ok(Value::Array(rows))
        }
        "index" => {
            let id = p["id"].as_str().ok_or("bad index request")?.to_string();
            let chapters = p["chapters"].as_array().ok_or("bad index request")?;
            let tx = db.transaction().map_err(|e| e.to_string())?;
            remove_version(&tx, &id);
            tx.execute("INSERT INTO versions (id, chapters, verses, indexed_at) VALUES (?, 0, 0, ?)", params![id, 0]).map_err(|e| e.to_string())?;
            let vid = tx.last_insert_rowid();
            tx.execute_batch(&format!("CREATE VIRTUAL TABLE \"fts_{}\" USING fts5(norm, text UNINDEXED, chapter_idx UNINDEXED, verse UNINDEXED, tokenize = 'trigram')", vid)).map_err(|e| e.to_string())?;
            let mut verses = 0i64;
            {
                let mut ins = tx.prepare(&format!("INSERT INTO \"fts_{}\" (norm, text, chapter_idx, verse) VALUES (?, ?, ?, ?)", vid)).map_err(|e| e.to_string())?;
                for (ci, ch) in chapters.iter().enumerate() {
                    let book = ch["book"].as_str().unwrap_or("");
                    let chap = ch["chapter"].as_str().map(|s| s.to_string()).unwrap_or_else(|| ch["chapter"].to_string().trim_matches('"').to_string());
                    for line in ch["content"].as_str().unwrap_or("").split('\n') {
                        let digits: String = line.chars().take_while(|c| c.is_ascii_digit()).collect();
                        if digits.is_empty() { continue; }
                        let rest = line[digits.len()..].trim_start();
                        if rest.len() == line.len() - digits.len() { continue; } // needs whitespace after the number
                        if rest.is_empty() { continue; }
                        ins.execute(params![normalize(&format!("{} {}:{} {}", book, chap, digits, rest)), rest, ci as i64, digits]).map_err(|e| e.to_string())?;
                        verses += 1;
                    }
                }
            }
            tx.execute("UPDATE versions SET chapters = ?, verses = ? WHERE vid = ?", params![chapters.len() as i64, verses, vid]).map_err(|e| e.to_string())?;
            tx.commit().map_err(|e| e.to_string())?;
            Ok(json!({"id": id, "chapters": chapters.len(), "verses": verses}))
        }
        "remove" => Ok(json!(remove_version(db, p["id"].as_str().unwrap_or("")))),
        "clear" => { reset(db); Ok(json!(true)) }
        "search" => {
            let id = p["id"].as_str().unwrap_or("");
            let vid: Option<i64> = db.query_row("SELECT vid FROM versions WHERE id = ?", [id], |r| r.get(0)).ok();
            let tokens = p["tokens"].as_array();
            let (vid, tokens) = match (vid, tokens) { (Some(v), Some(t)) if !t.is_empty() => (v, t), _ => return Ok(Value::Null) };
            let table = format!("fts_{}", vid);
            let (mut long, mut params_v, mut wh): (Vec<String>, Vec<String>, Vec<String>) = (vec![], vec![], vec![]);
            for t in tokens {
                let t = t.as_str().unwrap_or("");
                if t.chars().count() >= 3 { long.push(format!("\"{}\"", t.replace('"', "\"\""))); }
                else {
                    wh.push("norm LIKE ? ESCAPE '\\'".into());
                    params_v.push(format!("%{}%", t.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_")));
                }
            }
            if !long.is_empty() { wh.insert(0, format!("\"{}\" MATCH ?", table)); params_v.insert(0, long.join(" AND ")); }
            if let Some(ch) = p["chapters"].as_array() {
                if ch.is_empty() { return Ok(json!([])); }
                let list: Vec<String> = ch.iter().map(|n| (n.as_i64().unwrap_or(0)).to_string()).collect();
                wh.push(format!("chapter_idx IN ({})", list.join(",")));
            }
            let limit = p["max"].as_i64().unwrap_or(200).clamp(1, 1000);
            let sql = format!("SELECT chapter_idx, verse, text FROM \"{}\" WHERE {} ORDER BY rowid LIMIT {}", table, wh.join(" AND "), limit);
            let mut st = db.prepare(&sql).map_err(|e| e.to_string())?;
            let rows = st.query_map(params_from_iter(params_v.iter()), |r| Ok(json!({"chapterIndex": r.get::<_, i64>(0)?, "verse": r.get::<_, String>(1)?, "text": r.get::<_, String>(2)?})))
                .map_err(|e| e.to_string())?.filter_map(|x| x.ok()).collect::<Vec<_>>();
            Ok(Value::Array(rows))
        }
        _ => Err(format!("unknown method {}", method)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let path = std::env::temp_dir().join(format!("sp-search-test-{}.sqlite", crate::state::random_hex(4)));
        open(&path)
    }

    #[test]
    fn normalize_matches_the_panel() {
        assert_eq!(normalize("Café’s  Light, 1:3"), "cafe's light 1:3".replace("'", " "));
        assert_eq!(normalize("  A–B "), "a b");
    }

    #[test]
    fn index_then_search() {
        let mut conn = db();
        let chapters = json!([{ "book": "Genesis", "chapter": "1", "content": "1 In the beginning God created\n2 And darkness was upon the face\nnot a verse" }]);
        let r = call(&mut conn, "index", &json!({"id": "T", "chapters": chapters})).unwrap();
        assert_eq!(r["verses"], 2);
        let hits = call(&mut conn, "search", &json!({"id": "T", "tokens": ["darkness"]})).unwrap();
        assert_eq!(hits[0]["verse"], "2");
        let short = call(&mut conn, "search", &json!({"id": "T", "tokens": ["in"]})).unwrap();
        assert_eq!(short.as_array().unwrap().len(), 1);
        assert_eq!(call(&mut conn, "search", &json!({"id": "missing", "tokens": ["x"]})).unwrap(), Value::Null);
        assert_eq!(call(&mut conn, "remove", &json!({"id": "T"})).unwrap(), json!(true));
    }
}
