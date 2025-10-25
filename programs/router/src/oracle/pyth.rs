// Pyth Network oracle adapter for Barista DEX
//
// Reads prices from Pyth price feeds on Solana devnet/mainnet
// Documentation: https://docs.pyth.network/price-feeds/use-real-time-data/solana

use super::adapter::{OracleAdapter, OracleError, OraclePrice};
use pinocchio::account_info::AccountInfo;

// TODO: Full Pyth integration requires compatibility layer between pinocchio::AccountInfo
// and solana_program::account_info::AccountInfo. For now, we provide a stub implementation
// that can be enhanced once we have the type conversion helper.
//
// The pyth-sdk-solana crate expects solana_program::account_info::AccountInfo, but we use
// pinocchio::AccountInfo for efficiency. We'll need to either:
// 1. Create a conversion function from pinocchio::AccountInfo to solana::AccountInfo
// 2. Parse Pyth account data manually (more complex but avoids dependency issues)
//
// For devnet testing, users should use Custom oracle until this is resolved.

/// Pyth oracle adapter
pub struct PythAdapter {
    /// Maximum confidence as percentage of price (e.g., 2 = 2%)
    /// Reject prices with confidence interval > this threshold
    pub max_confidence_pct: u64,

    /// Maximum price age in seconds (e.g., 60 = reject prices older than 1 minute)
    pub max_age_secs: i64,
}

impl PythAdapter {
    /// Create new Pyth adapter with default parameters
    pub fn new() -> Self {
        Self {
            max_confidence_pct: 2,  // 2% max confidence
            max_age_secs: 60,        // 60 seconds max age
        }
    }

    /// Create Pyth adapter with custom parameters
    pub fn with_params(max_confidence_pct: u64, max_age_secs: i64) -> Self {
        Self {
            max_confidence_pct,
            max_age_secs,
        }
    }

    /// Scale Pyth price (with exponent) to 1e6 fixed scale
    ///
    /// Pyth uses variable exponents (typically -8 for BTC/USD)
    /// We normalize everything to 1e6 scale for consistency
    fn scale_price(price: i64, expo: i32) -> i64 {
        const TARGET_SCALE: i32 = 6; // 1e6

        if expo >= 0 {
            // Positive exponent: price * 10^expo / 10^6
            price.saturating_mul(10_i64.saturating_pow(expo as u32)) / 1_000_000
        } else {
            let abs_expo = expo.abs();
            if abs_expo > TARGET_SCALE {
                // Need to scale down: price / 10^(abs_expo - 6)
                price / 10_i64.saturating_pow((abs_expo - TARGET_SCALE) as u32)
            } else {
                // Need to scale up: price * 10^(6 - abs_expo)
                price.saturating_mul(10_i64.saturating_pow((TARGET_SCALE - abs_expo) as u32))
            }
        }
    }

    /// Get current Unix timestamp
    fn current_timestamp() -> i64 {
        // In BPF environment, we need to get this from Clock sysvar
        // For now, using a placeholder - will be replaced with actual Clock reading
        // TODO: Read from Clock sysvar in production
        0 // Placeholder
    }
}

impl OracleAdapter for PythAdapter {
    fn read_price(&self, _oracle_account: &AccountInfo) -> Result<OraclePrice, OracleError> {
        // TODO: Implement full Pyth integration once AccountInfo compatibility is resolved
        // For now, return an error directing users to use custom oracle for devnet
        Err(OracleError::InvalidAccount)
    }

    fn validate_account(&self, _oracle_account: &AccountInfo) -> Result<(), OracleError> {
        // TODO: Implement Pyth account validation
        Err(OracleError::InvalidAccount)
    }

    fn is_stale(&self, timestamp: i64, max_age_secs: i64) -> bool {
        let current_ts = Self::current_timestamp();
        if current_ts == 0 {
            // If no clock available, don't check staleness
            return false;
        }
        current_ts - timestamp > max_age_secs
    }

    fn provider_name(&self) -> &'static str {
        "Pyth (Not Implemented - Use Custom Oracle)"
    }
}

impl Default for PythAdapter {
    fn default() -> Self {
        Self::new()
    }
}
