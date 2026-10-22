//! Command pallas-probe exercises Pallas against a Dijkstra devnet node the way Oura, Dolos and cncli do:
//! node-to-client chain-sync, then `MultiEraBlock::decode` on every block and `MultiEraTx::decode` on raw bytes.
//!
//!     pallas-probe chain SOCKET   chain-sync from origin to the tip and tally decoding per era tag
//!     pallas-probe blocks SOCKET  chain-sync from origin to the tip and print each raw block as "era-tag hex",
//!                                 without decoding, for codecs that have no node client (CML, cardano-js-sdk)
//!     pallas-probe decode < LINES "name hex" per line: era detection and decode of a raw transaction, plus a
//!                                 forced Dijkstra decode (decode_for_era) when built with the dijkstra feature
//!
//! Only the dijkstra feature names the era, so it builds against revisions with and without Dijkstra;
//! build-pallas-probe.sh picks one.
use std::collections::BTreeMap;
use std::io::BufRead;

use pallas_network::facades::NodeClient;
use pallas_network::miniprotocols::{chainsync::NextResponse, Point};
use pallas_traverse::{MultiEraBlock, MultiEraTx};

const MAGIC: u64 = 42;

#[derive(Default)]
struct Tally {
    decoded: u64,
    transactions: u64,
    failed: u64,
    first_error: Option<String>,
}

// The hard-fork combinator wraps each block as [era tag, block].
fn era_tag(cbor: &[u8]) -> String {
    match cbor {
        [0x82, tag, ..] if *tag < 24 => tag.to_string(),
        _ => "?".into(),
    }
}

// Rolls forward from origin to the tip, handing each raw block (HFC-wrapped) and the tip slot to `each`, which
// returns false to stop early.
async fn sync(socket: &str, mut each: impl FnMut(&[u8], u64) -> bool) {
    let mut client = NodeClient::connect(socket, MAGIC).await.unwrap_or_else(|e| fail(&format!("connect: {e}")));
    let sync = client.chainsync();
    sync.find_intersect(vec![Point::Origin]).await.unwrap_or_else(|e| fail(&format!("intersect: {e}")));
    loop {
        match sync.request_next().await {
            Ok(NextResponse::RollForward(content, tip)) => {
                if !each(&content.0, tip.0.slot_or_default()) {
                    break;
                }
            }
            Ok(NextResponse::RollBackward(..)) => {}
            Ok(NextResponse::Await) => break,
            Err(e) => {
                println!("chain-sync error: {e}");
                break;
            }
        }
    }
}

async fn blocks(socket: &str) {
    sync(socket, |raw, _| {
        println!("{} {}", era_tag(raw), hex::encode(raw));
        true
    })
    .await;
}

async fn chain(socket: &str) {
    let mut tally: BTreeMap<String, Tally> = BTreeMap::new();
    sync(socket, |raw, tip| {
        let t = tally.entry(era_tag(raw)).or_default();
        match MultiEraBlock::decode(raw) {
            Ok(block) => {
                t.decoded += 1;
                for tx in block.txs() {
                    t.transactions += 1;
                    let _ = (tx.hash(), tx.inputs().len(), tx.outputs().len(), tx.fee());
                }
                block.slot() < tip
            }
            Err(e) => {
                t.failed += 1;
                t.first_error.get_or_insert_with(|| format!("block {} bytes: {}", raw.len(), short(&e.to_string())));
                true
            }
        }
    })
    .await;
    for (tag, t) in &tally {
        println!("era tag {tag}: {} blocks decoded, {} transactions, {} failed", t.decoded, t.transactions, t.failed);
        if let Some(e) = &t.first_error {
            println!("  first failure: {e}");
        }
    }
}

fn decode() {
    for line in std::io::stdin().lock().lines() {
        let line = line.unwrap();
        let Some((name, hex)) = line.split_once(' ') else { continue };
        let raw = hex::decode(hex.trim()).unwrap_or_else(|e| fail(&format!("{name}: {e}")));
        let result = match MultiEraTx::decode(&raw) {
            Ok(tx) => format!("{:?}: decoded, {} inputs, {} outputs", tx.era(), tx.inputs().len(), tx.outputs().len()),
            Err(e) => format!("decode: {}", short(&e.to_string())),
        };
        #[cfg(feature = "dijkstra")]
        let result = match MultiEraTx::decode_for_era(pallas_traverse::Era::Dijkstra, &raw) {
            Ok(tx) => format!("{result}; forced Dijkstra decode: ok, {} inputs", tx.inputs().len()),
            Err(e) => format!("{result}; forced Dijkstra decode: {}", short(&e.to_string())),
        };
        println!("{name:<30} head {}: {result}", &hex[..4]);
    }
}

// Unknown-structure errors embed the whole input as hex.
fn short(msg: &str) -> String {
    msg.chars().take(160).collect()
}

fn fail(msg: &str) -> ! {
    eprintln!("{msg}");
    std::process::exit(1)
}

#[tokio::main(flavor = "current_thread")]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    match (args.get(1).map(String::as_str), args.get(2)) {
        (Some("chain"), Some(socket)) => chain(socket).await,
        (Some("blocks"), Some(socket)) => blocks(socket).await,
        (Some("decode"), _) => decode(),
        _ => fail("usage: pallas-probe chain|blocks SOCKET | decode < LINES"),
    }
}
