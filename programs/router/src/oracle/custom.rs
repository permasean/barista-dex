// Custom oracle adapter for Barista DEX
//
// Reads prices from our custom test oracle (programs/oracle/)
// Used for localnet testing only - NOT for production

use super::adapter::{OracleAdapter, OracleError, OraclePrice};
use pinocchio::account_info::AccountInfo;

/// Custom oracle adapter for test oracle
pub struct CustomAdapter {
    /// Maximum price age in seconds
    pub max_age_secs: i64,
}

impl CustomAdapter {
    /// Create new custom adapter with default 60s max age
    pub fn new() -> Self {
        Self { max_age_secs: 60 }
    }

    /// Create custom adapter with specific max age
    pub fn with_max_age(max_age_secs: i64) -> Self {
        Self { max_age_secs }
    }

    /// Get current Unix timestamp
    fn current_timestamp() -> i64 {
        // In BPF environment, read from Clock sysvar
        // TODO: Replace with actual Clock reading
        0 // Placeholder
    }
}

/// Custom oracle format (from programs/oracle/src/state.rs):
/// ```
/// pub struct PriceOracle {
///     pub magic: [u8; 8],        // "PRCLORCL" (offset 0)
///     pub version: u8,           // offset 8
///     pub bump: u8,              // offset 9
///     pub _padding: [u8; 6],     // offset 10
///     pub authority: Pubkey,     // offset 16 (32 bytes)
///     pub instrument: Pubkey,    // offset 48 (32 bytes)
///     pub price: i64,            // offset 80 (8 bytes) <<<
///     pub timestamp: i64,        // offset 88 (8 bytes)
///     pub confidence: i64,       // offset 96 (8 bytes)
///     pub _reserved: [u8; 24],   // offset 104
/// }
/// Total: 128 bytes
/// ```

const PRICE_OFFSET: usize = 80;
const TIMESTAMP_OFFSET: usize = 88;
const CONFIDENCE_OFFSET: usize = 96;
const ORACLE_SIZE: usize = 128;
const MAGIC: &[u8; 8] = b"PRCLORCL";

impl OracleAdapter for CustomAdapter {
    fn read_price(&self, oracle_account: &AccountInfo) -> Result<OraclePrice, OracleError> {
        // Validate account first
        self.validate_account(oracle_account)?;

        // Borrow account data
        let data = oracle_account
            .try_borrow_data()
            .map_err(|_| OracleError::InvalidAccount)?;

        // Validate data length
        if data.len() != ORACLE_SIZE {
            return Err(OracleError::InvalidFormat);
        }

        // Validate magic bytes
        if &data[0..8] != MAGIC {
            return Err(OracleError::InvalidFormat);
        }

        // Read price (offset 80, i64 little-endian)
        let price_bytes: [u8; 8] = data[PRICE_OFFSET..PRICE_OFFSET + 8]
            .try_into()
            .map_err(|_| OracleError::InvalidFormat)?;
        let price = i64::from_le_bytes(price_bytes);

        // Read timestamp (offset 88, i64 little-endian)
        let ts_bytes: [u8; 8] = data[TIMESTAMP_OFFSET..TIMESTAMP_OFFSET + 8]
            .try_into()
            .map_err(|_| OracleError::InvalidFormat)?;
        let timestamp = i64::from_le_bytes(ts_bytes);

        // Read confidence (offset 96, i64 little-endian)
        let conf_bytes: [u8; 8] = data[CONFIDENCE_OFFSET..CONFIDENCE_OFFSET + 8]
            .try_into()
            .map_err(|_| OracleError::InvalidFormat)?;
        let confidence = i64::from_le_bytes(conf_bytes);

        // Check staleness
        if self.is_stale(timestamp, self.max_age_secs) {
            return Err(OracleError::StalePrice);
        }

        // Custom oracle already uses 1e6 scale, no conversion needed
        Ok(OraclePrice {
            price,
            confidence,
            timestamp,
            expo: -6, // 1e6 scale
        })
    }

    fn validate_account(&self, oracle_account: &AccountInfo) -> Result<(), OracleError> {
        // Check account has data
        let data = oracle_account
            .try_borrow_data()
            .map_err(|_| OracleError::InvalidAccount)?;

        // Validate size
        if data.len() != ORACLE_SIZE {
            return Err(OracleError::InvalidAccount);
        }

        // Validate magic
        if &data[0..8] != MAGIC {
            return Err(OracleError::InvalidAccount);
        }

        Ok(())
    }

    fn is_stale(&self, timestamp: i64, max_age_secs: i64) -> bool {
        let current_ts = Self::current_timestamp();
        current_ts - timestamp > max_age_secs
    }

    fn provider_name(&self) -> &'static str {
        "Custom"
    }
}

impl Default for CustomAdapter {
    fn default() -> Self {
        Self::new()
    }
}
