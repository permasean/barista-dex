// Oracle integration module for Barista DEX Router
//
// Provides unified interface for reading oracle prices from:
// - Pyth Network (production mainnet/devnet)
// - Custom oracle (localnet testing)
//
// All prices are normalized to 1e6 scale (i.e., $50,000 = 50_000_000_000)

pub mod adapter;
pub mod pyth;
pub mod custom;

pub use adapter::{OracleAdapter, OraclePrice, OracleError};
pub use pyth::PythAdapter;
pub use custom::CustomAdapter;
