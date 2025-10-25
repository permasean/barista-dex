// Oracle adapter trait - unified interface for all oracle types

use pinocchio::account_info::AccountInfo;

/// Standardized oracle price representation
/// All prices normalized to 1e6 scale (e.g., $50,000 = 50_000_000_000)
#[derive(Debug, Clone, Copy)]
pub struct OraclePrice {
    /// Price in 1e6 scale
    pub price: i64,
    /// Confidence interval (±) in 1e6 scale
    pub confidence: i64,
    /// Unix timestamp when price was published
    pub timestamp: i64,
    /// Original exponent from source (for reference)
    pub expo: i32,
}

/// Oracle adapter errors
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OracleError {
    /// Oracle account is invalid or has wrong owner
    InvalidAccount,
    /// Oracle data format is corrupted or unexpected
    InvalidFormat,
    /// Price is too old (exceeds max_age_secs)
    StalePrice,
    /// Confidence interval is too wide (unreliable price)
    LowConfidence,
    /// Oracle price is missing or unavailable
    PriceUnavailable,
}

/// Unified interface for reading prices from different oracle providers
pub trait OracleAdapter {
    /// Read price from oracle account
    ///
    /// Returns normalized OraclePrice or error if:
    /// - Account format is invalid
    /// - Price is stale
    /// - Confidence is too low
    fn read_price(&self, oracle_account: &AccountInfo) -> Result<OraclePrice, OracleError>;

    /// Validate oracle account ownership and format
    fn validate_account(&self, oracle_account: &AccountInfo) -> Result<(), OracleError>;

    /// Check if price timestamp is stale
    fn is_stale(&self, timestamp: i64, max_age_secs: i64) -> bool;

    /// Get provider name for logging/errors
    fn provider_name(&self) -> &'static str;
}
