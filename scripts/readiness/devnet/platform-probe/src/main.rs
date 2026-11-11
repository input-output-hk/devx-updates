//! Command platform-probe runs blockfrost-platform's pre-submit check on labeled transactions.
//!
//! blockfrost-platform's `/tx/submit` decodes the body as `pallas_primitives::conway::Tx` before it forwards anything
//! to the node (crates/node/src/cbor/validation.rs, `validate_tx_cbor`), and answers a decode failure with HTTP 400 and
//! the message `as_cbor_decode_failure` formats. This probe does the same, with the Pallas revision the platform pins
//! (Cargo.toml), so a REJECT line means the platform never hands that transaction to the node.
//!
//! Usage: platform-probe < labeled, where each line is `<label> <hex>` (transactions-labeled.txt).
use pallas_hardano::display::haskell_error::as_cbor_decode_failure;
use pallas_primitives::conway::Tx;
use std::io::BufRead;

fn main() {
    for line in std::io::stdin().lock().lines() {
        let line = line.expect("read stdin");
        let mut fields = line.split_whitespace();
        let (Some(label), Some(hex)) = (fields.next(), fields.next()) else { continue };
        let bytes = hex::decode(hex).expect("hex transaction");
        match pallas_codec::minicbor::decode::<Tx>(&bytes) {
            Ok(_) => println!("{label:40} accepted: forwarded to the node"),
            Err(e) => {
                let message = as_cbor_decode_failure(e.to_string(), e.position().unwrap_or(0) as u64)
                    .unwrap_or_else(|e| format!("Failed to format decode error: {e}"));
                println!("{label:40} rejected, HTTP 400: {}", message.chars().take(160).collect::<String>());
            }
        }
    }
}
