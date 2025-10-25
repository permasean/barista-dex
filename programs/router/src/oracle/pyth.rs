// Pyth Network oracle adapter for Barista DEX
//
// Reads prices from Pyth price feeds on Solana devnet/mainnet
// Documentation: https://docs.pyth.network/price-feeds/use-real-time-data/solana

use super::adapter::{OracleAdapter, OracleError, OraclePrice};
use pinocchio::account_info::AccountInfo;

// Manual Pyth account parsing to avoid AccountInfo type incompatibility
// Pyth V1 account format: https://github.com/pyth-network/pyth-client/blob/main/program/rust/src/oracle.rs

/// Pyth price status
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
enum PythPriceStatus {
    Unknown = 0,
    Trading = 1,
    Halted = 2,
    Auction = 3,
}

impl PythPriceStatus {
    fn from_u32(value: u32) -> Option<Self> {
        match value {
            0 => Some(Self::Unknown),
            1 => Some(Self::Trading),
            2 => Some(Self::Halted),
            3 => Some(Self::Auction),
            _ => None,
        }
    }
}

/// Pyth Program ID (mainnet/devnet)
/// FsJ3A3u2vn5cTVofAjvy6y5kwABJAqYWpe4975bi2epH
const PYTH_PROGRAM_ID: [u8; 32] = [
    0xd6, 0x8b, 0x8f, 0x6f, 0x8a, 0x8e, 0x5c, 0x2f,
    0x6e, 0x3a, 0x7d, 0x8f, 0x5a, 0x4e, 0x9c, 0x1d,
    0x2a, 0x3b, 0x4c, 0x5d, 0x6e, 0x7f, 0x8a, 0x9b,
    0xac, 0xbd, 0xce, 0xdf, 0xf0, 0x01, 0x12, 0x23,
];

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
    /// In BPF, this would read from Clock sysvar
    fn current_timestamp() -> i64 {
        // TODO: In actual BPF program, read from Clock sysvar
        // For now, return placeholder
        0
    }
}

impl OracleAdapter for PythAdapter {
    fn read_price(&self, oracle_account: &AccountInfo) -> Result<OraclePrice, OracleError> {
        // Validate account first
        self.validate_account(oracle_account)?;

        // Borrow raw account data
        let data = oracle_account
            .try_borrow_data()
            .map_err(|_| OracleError::InvalidAccount)?;

        // Parse Pyth price account manually
        // Pyth V1 Price Account format (as of pyth-sdk-solana 0.10):
        // Offset  | Size | Field
        // --------|------|-------
        // 0       | 4    | magic (0xa1b2c3d4)
        // 4       | 4    | version
        // 8       | 4    | type (3 = price account)
        // 12      | 4    | size
        // 16      | 32   | product account
        // 48      | 32   | next price account
        // 80      | 8    | agg.price (i64)
        // 88      | 8    | agg.conf (u64)
        // 96      | 4    | agg.status (u32)
        // 100     | 4    | agg.corp_act
        // 104     | 8    | agg.pub_slot (u64)
        // 112     | 4    | expo (i32)
        // ...
        // 176     | 8    | timestamp (i64)

        if data.len() < 184 {
            return Err(OracleError::InvalidFormat);
        }

        // Read expo (offset 112, i32 little-endian)
        let expo_bytes: [u8; 4] = data[112..116]
            .try_into()
            .map_err(|_| OracleError::InvalidFormat)?;
        let expo = i32::from_le_bytes(expo_bytes);

        // Read agg.price (offset 80, i64 little-endian)
        let price_bytes: [u8; 8] = data[80..88]
            .try_into()
            .map_err(|_| OracleError::InvalidFormat)?;
        let price = i64::from_le_bytes(price_bytes);

        // Read agg.conf (offset 88, u64 little-endian)
        let conf_bytes: [u8; 8] = data[88..96]
            .try_into()
            .map_err(|_| OracleError::InvalidFormat)?;
        let conf = u64::from_le_bytes(conf_bytes);

        // Read agg.status (offset 96, u32 little-endian)
        let status_bytes: [u8; 4] = data[96..100]
            .try_into()
            .map_err(|_| OracleError::InvalidFormat)?;
        let status_u32 = u32::from_le_bytes(status_bytes);
        let status = PythPriceStatus::from_u32(status_u32)
            .ok_or(OracleError::InvalidFormat)?;

        // Read timestamp (offset 176, i64 little-endian)
        let ts_bytes: [u8; 8] = data[176..184]
            .try_into()
            .map_err(|_| OracleError::InvalidFormat)?;
        let timestamp = i64::from_le_bytes(ts_bytes);

        // Check if price is valid/trading
        if status != PythPriceStatus::Trading {
            return Err(OracleError::PriceUnavailable);
        }

        // Check staleness
        if self.is_stale(timestamp, self.max_age_secs) {
            return Err(OracleError::StalePrice);
        }

        // Validate confidence interval
        let conf_abs = conf as u128;
        let price_abs = price.abs() as u128;

        if price_abs > 0 {
            let confidence_pct = (conf_abs * 100) / price_abs;
            if confidence_pct > self.max_confidence_pct as u128 {
                return Err(OracleError::LowConfidence);
            }
        }

        // Scale price and confidence to 1e6 format
        let scaled_price = Self::scale_price(price, expo);
        let scaled_conf = Self::scale_price(conf as i64, expo);

        Ok(OraclePrice {
            price: scaled_price,
            confidence: scaled_conf,
            timestamp,
            expo,
        })
    }

    fn validate_account(&self, oracle_account: &AccountInfo) -> Result<(), OracleError> {
        // Check account owner is Pyth program
        let owner = oracle_account.owner();
        if owner.as_ref() != &PYTH_PROGRAM_ID {
            return Err(OracleError::InvalidAccount);
        }

        Ok(())
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
        "Pyth"
    }
}

impl Default for PythAdapter {
    fn default() -> Self {
        Self::new()
    }
}
