//! Oracle management module for Percolator Keeper
//!
//! Provides CLI commands for managing custom oracles in localnet/devnet:
//! - init: Initialize new oracle account
//! - update: Update oracle price
//! - show: Display oracle information
//! - crank: Automated price updater service

pub mod commands;
pub mod price_sources;

use anyhow::Result;
use solana_sdk::pubkey::Pubkey;

/// Oracle account structure (128 bytes)
/// Matches programs/oracle/src/state.rs
#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct PriceOracle {
    pub magic: [u8; 8],        // "PRCLORCL"
    pub version: u8,
    pub bump: u8,
    pub _padding: [u8; 6],
    pub authority: Pubkey,
    pub instrument: Pubkey,
    pub price: i64,            // 1e6 scale
    pub timestamp: i64,
    pub confidence: i64,       // 1e6 scale
    pub _reserved: [u8; 24],
}

impl PriceOracle {
    pub const MAGIC: &'static [u8; 8] = b"PRCLORCL";
    pub const SIZE: usize = 128;

    /// Parse oracle from account data
    pub fn from_bytes(data: &[u8]) -> Result<Self> {
        if data.len() < Self::SIZE {
            anyhow::bail!("Invalid oracle account size: {} (expected 128)", data.len());
        }

        // Validate magic bytes
        if &data[0..8] != Self::MAGIC {
            anyhow::bail!("Invalid magic bytes");
        }

        unsafe {
            let oracle = std::ptr::read(data.as_ptr() as *const PriceOracle);
            Ok(oracle)
        }
    }

    /// Get price as f64 (converts from 1e6 scale)
    pub fn price_f64(&self) -> f64 {
        self.price as f64 / 1_000_000.0
    }

    /// Get confidence as f64 (converts from 1e6 scale)
    pub fn confidence_f64(&self) -> f64 {
        self.confidence as f64 / 1_000_000.0
    }

    /// Check if price is stale (older than max_age_secs)
    pub fn is_stale(&self, max_age_secs: i64) -> bool {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        now - self.timestamp > max_age_secs
    }
}
