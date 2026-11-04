//! Command cml-probe decodes what the Dijkstra devnet node produced with cardano-multiplatform-lib (CML), the way
//! its consumers do. CML has no node client, so the input comes from pallas-probe:
//!
//!     cml-probe blocks < LINES  "era-tag hex" per line (pallas-probe blocks): MultiEraBlock decode of the
//!                               HFC-wrapped block, plus a Conway Block decode of the unwrapped one, tallied per tag
//!     cml-probe decode < LINES  "name hex" per line: Transaction decode of a raw transaction
use std::collections::BTreeMap;
use std::io::BufRead;

use cml_chain::block::Block;
use cml_chain::transaction::Transaction;
use cml_core::serialization::Deserialize;
use cml_multi_era::MultiEraBlock;

#[derive(Default)]
struct Tally {
    blocks: u64,
    multi_era_ok: u64,
    conway_ok: u64,
    multi_era_error: Option<String>,
    conway_error: Option<String>,
}

fn lines() -> impl Iterator<Item = (String, Vec<u8>)> {
    std::io::stdin().lock().lines().filter_map(|line| {
        let line = line.unwrap();
        let (name, hex) = line.split_once(' ')?;
        Some((name.to_string(), hex::decode(hex.trim()).expect("hex")))
    })
}

fn blocks() {
    let mut tally: BTreeMap<String, Tally> = BTreeMap::new();
    for (tag, raw) in lines() {
        let t = tally.entry(tag).or_default();
        t.blocks += 1;
        match MultiEraBlock::from_explicit_network_cbor_bytes(&raw) {
            Ok(_) => t.multi_era_ok += 1,
            Err(e) => drop(t.multi_era_error.get_or_insert_with(|| short(&e.to_string()))),
        }
        // [era tag, block]: the tag is a single byte below 24, so the block starts at offset 2.
        match Block::from_cbor_bytes(&raw[2..]) {
            Ok(_) => t.conway_ok += 1,
            Err(e) => drop(t.conway_error.get_or_insert_with(|| short(&e.to_string()))),
        }
    }
    for (tag, t) in &tally {
        println!("era tag {tag}: {} blocks; MultiEraBlock decoded {}, Conway Block decoded {}", t.blocks, t.multi_era_ok, t.conway_ok);
        if let Some(e) = &t.multi_era_error {
            println!("  first MultiEraBlock failure: {e}");
        }
        if let Some(e) = &t.conway_error {
            println!("  first Conway Block failure: {e}");
        }
    }
}

fn decode() {
    for (name, raw) in lines() {
        let result = match Transaction::from_cbor_bytes(&raw) {
            Ok(tx) => format!("decoded, {} inputs", tx.body.inputs.len()),
            Err(e) => format!("decode: {}", short(&e.to_string())),
        };
        println!("{name:<30} head {:02x}{:02x}: {result}", raw[0], raw[1]);
    }
}

fn short(msg: &str) -> String {
    msg.chars().take(200).collect()
}

fn main() {
    match std::env::args().nth(1).as_deref() {
        Some("blocks") => blocks(),
        Some("decode") => decode(),
        _ => {
            eprintln!("usage: cml-probe blocks|decode < LINES");
            std::process::exit(1)
        }
    }
}
