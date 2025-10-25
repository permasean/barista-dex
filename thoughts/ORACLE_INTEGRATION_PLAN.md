# Production Oracle Integration - Comprehensive Implementation Plan

**Status**: Not Started
**Priority**: Critical (Blocking Production)
**Est. Effort**: 3-4 weeks
**Last Updated**: 2025-01-24

---

## Executive Summary

Oracle integration is **NOT** just for liquidations - it's the core mechanism that enables:
1. **Portfolio margining** - IM/MM calculations on every trade
2. **Cross-slab netting** - Shared marks prevent basis risk (THE KEY VALUE PROP!)
3. **Mark-to-market PnL** - Real-time unrealized profit/loss tracking
4. **Funding rates** - Keep perpetual prices anchored to spot
5. **Liquidations** - Safe price discovery during forced closes

**Current State**: Custom test oracle only used in liquidations. All other operations use stale/hardcoded prices.

**Target State**: Production-ready oracle adapter supporting Pyth, Switchboard, and custom oracles with staleness checks, cross-slab alignment validation, and integration into all margin/PnL/funding calculations.

---

## Current Architecture Analysis

### What Exists

#### 1. Custom Oracle Program (`programs/oracle/`)
- **Purpose**: Test-only oracle with authority-controlled price updates
- **Structure**: `PriceOracle` (128 bytes)
  - Magic + version + bump (16 bytes)
  - Authority pubkey (32 bytes)
  - Instrument pubkey (32 bytes)
  - **Price at offset 72** (i64, 1e6 scale)
  - Timestamp (i64)
  - Confidence (i64)
- **Instructions**:
  - `initialize()` - Create oracle with initial price
  - `update_price()` - Authority updates price + confidence
- **Location**: `programs/oracle/src/instructions.rs:87-145`

#### 2. Oracle Reading in Liquidations
- **File**: `programs/router/src/instructions/liquidate_user.rs:134-162`
- **Method**: Hardcoded byte offset reading:
  ```rust
  let price_bytes = [oracle_data[72], oracle_data[73], ..., oracle_data[79]];
  let price = i64::from_le_bytes(price_bytes);
  ```
- **Issues**:
  - Only works with custom oracle format
  - No staleness check (timestamp validation)
  - No confidence interval validation
  - Hardcoded offset breaks with different oracle providers

#### 3. Oracle Alignment Validation
- **File**: `programs/router/src/liquidation/oracle.rs:18-38`
- **Function**: `validate_oracle_alignment(slab_mark, oracle_price, tolerance_bps)`
- **Purpose**: Check if slab's cached mark price is within tolerance of oracle price
- **Usage**: Only in liquidation path (should be in EVERY trade!)

#### 4. Mark Price Fields (Unused!)
- **SlabHeader**: `mark_px: i64` at `programs/common/src/header.rs:31`
- **Instrument**: `index_price: u64` at `programs/common/src/types.rs:106`
- **Problem**: These fields exist but are **NEVER updated from oracles** in normal operations

#### 5. Margin Calculation Functions (Oracle-Aware)
- **File**: `programs/common/src/math.rs:97-115`
- **Functions**:
  ```rust
  pub fn calculate_im(qty: i64, contract_size: u64, mark_price: u64, imr_bps: u64) -> u128
  pub fn calculate_mm(qty: i64, contract_size: u64, mark_price: u64, mmr_bps: u64) -> u128
  ```
- **Problem**: Functions expect `mark_price` parameter, but callers pass stale/hardcoded values

### Critical Gaps

| Component | Current State | Required for Production | Impact |
|-----------|---------------|-------------------------|--------|
| **Oracle Adapter** | Hardcoded byte offset reading | Abstraction for Pyth/Switchboard/custom | Can't use production oracles |
| **Staleness Checks** | None | Timestamp + max age validation | Stale prices → incorrect margin/liquidations |
| **Cross-Slab Alignment** | Not enforced | Validate all slabs use aligned oracles | Basis risk destroys capital efficiency |
| **Margin Calculation** | Uses stale prices | Fresh oracle prices on every trade | Incorrect IM/MM → insolvency risk |
| **Mark-to-Market PnL** | Not implemented | Oracle-based unrealized PnL | Can't display accurate portfolio value |
| **Funding Rates** | Stubbed | Index vs Mark premium/discount | Perpetual price divergence from spot |
| **Oracle Update Mechanism** | Manual authority only | Automated price feeds + crank | Prices never update in production |

---

## Production Requirements

### Functional Requirements

**FR1: Multi-Oracle Support**
- Support Pyth Network (primary for mainnet)
- Support Switchboard (fallback)
- Support custom oracle (devnet/testing)
- Unified interface for all oracle types

**FR2: Price Staleness Detection**
- Reject oracle prices older than configurable threshold (e.g., 60 seconds)
- Emit warnings for approaching staleness
- Fallback mechanism if primary oracle stale

**FR3: Cross-Slab Oracle Alignment**
- Enforce all slabs for same instrument use same oracle OR aligned oracles
- Tolerance-based validation (e.g., 0.5% max divergence)
- Reject trades if alignment check fails

**FR4: Margin Integration**
- Read oracle prices before every margin calculation
- Update portfolio equity with mark-to-market PnL
- Use fresh oracle prices for IM/MM checks

**FR5: Funding Rate Mechanism**
- Calculate funding based on (Mark Price - Index Price)
- Apply funding to positions periodically (e.g., hourly)
- Net funding across slabs at portfolio level

**FR6: Oracle-Aware Liquidations**
- Use oracle prices for liquidation threshold checks
- Price band enforcement during liquidation sweeps
- Oracle alignment validation before liquidation execution

### Non-Functional Requirements

**NFR1: Performance**
- Oracle price reading: < 10 μs per oracle
- No additional CPI calls in critical path (batch read multiple oracles)
- Cache oracle prices within transaction for multiple uses

**NFR2: Reliability**
- Graceful degradation if oracle temporarily unavailable
- No single point of failure (multiple oracle sources)
- Deterministic behavior (same inputs → same outputs)

**NFR3: Security**
- Validate oracle account ownership (prevent spoofing)
- Confidence interval checks (reject low-confidence prices)
- Price sanity checks (circuit breakers for extreme moves)

**NFR4: Maintainability**
- Oracle provider abstraction allows adding new oracles without core changes
- Comprehensive test coverage for all oracle scenarios
- Clear documentation of oracle integration points

---

## Implementation Phases

## Phase 1: Oracle Adapter Layer (Week 1)

### Objectives
- Create abstraction for multiple oracle providers
- Implement Pyth adapter
- Implement Switchboard adapter
- Maintain backward compatibility with custom oracle

### Deliverables

#### 1.1 Oracle Trait Definition

**File**: `programs/router/src/oracle/adapter.rs` (NEW)

```rust
/// Unified oracle interface for different providers
pub trait OracleAdapter {
    /// Read current price from oracle account
    /// Returns (price, confidence, timestamp)
    fn read_price(&self, oracle_account: &AccountInfo) -> Result<OraclePrice, OracleError>;

    /// Validate oracle account ownership and structure
    fn validate_account(&self, oracle_account: &AccountInfo) -> Result<(), OracleError>;

    /// Check if price is stale (exceeds max age)
    fn is_stale(&self, timestamp: i64, max_age_secs: i64) -> bool;

    /// Get oracle provider name for logging
    fn provider_name(&self) -> &'static str;
}

/// Standardized oracle price structure
#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct OraclePrice {
    pub price: i64,           // Price in 1e6 scale
    pub confidence: i64,      // Confidence interval (±)
    pub timestamp: i64,       // Unix timestamp
    pub expo: i32,            // Price exponent (for Pyth)
}

/// Oracle-specific errors
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OracleError {
    InvalidAccount,
    StalePrice,
    LowConfidence,
    InvalidFormat,
    PriceOutOfBounds,
}
```

**Tests**:
- Trait object creation and method dispatch
- Error handling for each error variant

#### 1.2 Pyth Oracle Adapter

**File**: `programs/router/src/oracle/pyth.rs` (NEW)

```rust
use pyth_sdk_solana::load_price_feed_from_account_info;
use super::adapter::{OracleAdapter, OraclePrice, OracleError};

pub struct PythAdapter {
    pub max_confidence_pct: u64,  // Max confidence as % of price (e.g., 2 = 2%)
    pub max_age_secs: i64,         // Max price age in seconds
}

impl OracleAdapter for PythAdapter {
    fn read_price(&self, oracle_account: &AccountInfo) -> Result<OraclePrice, OracleError> {
        // Load Pyth price feed
        let price_feed = load_price_feed_from_account_info(oracle_account)
            .map_err(|_| OracleError::InvalidAccount)?;

        let current_price = price_feed.get_current_price()
            .ok_or(OracleError::InvalidFormat)?;

        // Validate confidence interval
        let confidence_pct = (current_price.conf as u128 * 100) / current_price.price.abs() as u128;
        if confidence_pct > self.max_confidence_pct as u128 {
            return Err(OracleError::LowConfidence);
        }

        // Convert to standardized format
        // Pyth uses variable exponent, convert to 1e6 scale
        let scaled_price = scale_pyth_price(current_price.price, current_price.expo);
        let scaled_conf = scale_pyth_price(current_price.conf as i64, current_price.expo);

        Ok(OraclePrice {
            price: scaled_price,
            confidence: scaled_conf,
            timestamp: current_price.publish_time,
            expo: current_price.expo,
        })
    }

    fn validate_account(&self, oracle_account: &AccountInfo) -> Result<(), OracleError> {
        // Check account owner is Pyth program
        if oracle_account.owner() != &pyth_sdk_solana::ID {
            return Err(OracleError::InvalidAccount);
        }
        Ok(())
    }

    fn is_stale(&self, timestamp: i64, max_age_secs: i64) -> bool {
        let current_ts = Clock::get().unwrap().unix_timestamp;
        current_ts - timestamp > max_age_secs
    }

    fn provider_name(&self) -> &'static str {
        "Pyth"
    }
}

/// Scale Pyth price (with exponent) to 1e6 fixed scale
fn scale_pyth_price(price: i64, expo: i32) -> i64 {
    const TARGET_SCALE: i32 = 6; // 1e6

    if expo >= 0 {
        // Positive exponent: price * 10^expo / 10^6
        price.saturating_mul(10_i64.pow(expo as u32)) / 1_000_000
    } else {
        let abs_expo = expo.abs();
        if abs_expo > TARGET_SCALE {
            // Need to scale down: price / 10^(abs_expo - 6)
            price / 10_i64.pow((abs_expo - TARGET_SCALE) as u32)
        } else {
            // Need to scale up: price * 10^(6 - abs_expo)
            price.saturating_mul(10_i64.pow((TARGET_SCALE - abs_expo) as u32))
        }
    }
}
```

**Dependencies**:
- Add to `Cargo.toml`: `pyth-sdk-solana = "0.10"`

**Tests**:
- Pyth account parsing with real mainnet snapshots
- Confidence validation (reject if > threshold)
- Staleness detection
- Price scaling for various exponents (e.g., -8, -6, -5)

#### 1.3 Switchboard Adapter

**File**: `programs/router/src/oracle/switchboard.rs` (NEW)

```rust
use switchboard_solana::AggregatorAccountData;
use super::adapter::{OracleAdapter, OraclePrice, OracleError};

pub struct SwitchboardAdapter {
    pub max_confidence_pct: u64,
    pub max_age_secs: i64,
}

impl OracleAdapter for SwitchboardAdapter {
    fn read_price(&self, oracle_account: &AccountInfo) -> Result<OraclePrice, OracleError> {
        // Parse Switchboard aggregator account
        let aggregator = AggregatorAccountData::new(oracle_account)
            .map_err(|_| OracleError::InvalidAccount)?;

        let result = aggregator.get_result()
            .map_err(|_| OracleError::InvalidFormat)?;

        // Switchboard uses f64, convert to i64 1e6 scale
        let price_f64 = result.mantissa as f64 * 10_f64.powi(result.scale);
        let price = (price_f64 * 1_000_000.0) as i64;

        // Get standard deviation as confidence
        let std_dev_f64 = aggregator.latest_confirmed_round.std_deviation
            .mantissa as f64 * 10_f64.powi(aggregator.latest_confirmed_round.std_deviation.scale);
        let confidence = (std_dev_f64 * 1_000_000.0) as i64;

        // Validate confidence
        let confidence_pct = (confidence.abs() as u128 * 100) / price.abs() as u128;
        if confidence_pct > self.max_confidence_pct as u128 {
            return Err(OracleError::LowConfidence);
        }

        Ok(OraclePrice {
            price,
            confidence,
            timestamp: aggregator.latest_confirmed_round.round_open_timestamp,
            expo: result.scale,
        })
    }

    fn validate_account(&self, oracle_account: &AccountInfo) -> Result<(), OracleError> {
        // Switchboard uses various program IDs, check discriminator instead
        let data = oracle_account.try_borrow_data()
            .map_err(|_| OracleError::InvalidAccount)?;

        // Check for Switchboard aggregator discriminator
        if data.len() < 8 || &data[0..8] != AggregatorAccountData::DISCRIMINATOR {
            return Err(OracleError::InvalidAccount);
        }

        Ok(())
    }

    fn is_stale(&self, timestamp: i64, max_age_secs: i64) -> bool {
        let current_ts = Clock::get().unwrap().unix_timestamp;
        current_ts - timestamp > max_age_secs
    }

    fn provider_name(&self) -> &'static str {
        "Switchboard"
    }
}
```

**Dependencies**:
- Add to `Cargo.toml`: `switchboard-solana = "0.29"`

**Tests**:
- Switchboard account parsing
- f64 to i64 conversion accuracy
- Confidence validation
- Staleness checks

#### 1.4 Custom Oracle Adapter (Backward Compatibility)

**File**: `programs/router/src/oracle/custom.rs` (NEW)

```rust
use crate::oracle::adapter::{OracleAdapter, OraclePrice, OracleError};
use programs::oracle::state::PriceOracle;

pub struct CustomAdapter {
    pub max_age_secs: i64,
}

impl OracleAdapter for CustomAdapter {
    fn read_price(&self, oracle_account: &AccountInfo) -> Result<OraclePrice, OracleError> {
        let oracle_data = oracle_account.try_borrow_data()
            .map_err(|_| OracleError::InvalidAccount)?;

        if oracle_data.len() < 128 {
            return Err(OracleError::InvalidAccount);
        }

        // Read custom oracle format (existing hardcoded logic)
        let price_bytes = [
            oracle_data[72], oracle_data[73], oracle_data[74], oracle_data[75],
            oracle_data[76], oracle_data[77], oracle_data[78], oracle_data[79],
        ];
        let price = i64::from_le_bytes(price_bytes);

        // Read timestamp (offset 80)
        let timestamp_bytes = [
            oracle_data[80], oracle_data[81], oracle_data[82], oracle_data[83],
            oracle_data[84], oracle_data[85], oracle_data[86], oracle_data[87],
        ];
        let timestamp = i64::from_le_bytes(timestamp_bytes);

        // Read confidence (offset 88)
        let confidence_bytes = [
            oracle_data[88], oracle_data[89], oracle_data[90], oracle_data[91],
            oracle_data[92], oracle_data[93], oracle_data[94], oracle_data[95],
        ];
        let confidence = i64::from_le_bytes(confidence_bytes);

        Ok(OraclePrice {
            price,
            confidence,
            timestamp,
            expo: -6, // Custom oracle uses 1e6 scale
        })
    }

    fn validate_account(&self, oracle_account: &AccountInfo) -> Result<(), OracleError> {
        let oracle_data = oracle_account.try_borrow_data()
            .map_err(|_| OracleError::InvalidAccount)?;

        if oracle_data.len() < 128 {
            return Err(OracleError::InvalidAccount);
        }

        // Check magic bytes (first 8 bytes should be "PRCLORCL")
        if &oracle_data[0..8] != b"PRCLORCL" {
            return Err(OracleError::InvalidAccount);
        }

        Ok(())
    }

    fn is_stale(&self, timestamp: i64, max_age_secs: i64) -> bool {
        let current_ts = Clock::get().unwrap().unix_timestamp;
        current_ts - timestamp > max_age_secs
    }

    fn provider_name(&self) -> &'static str {
        "Custom"
    }
}
```

**Tests**:
- Custom oracle format reading
- Magic byte validation
- Backward compatibility with existing liquidation code

#### 1.5 Oracle Factory

**File**: `programs/router/src/oracle/factory.rs` (NEW)

```rust
use super::adapter::OracleAdapter;
use super::{pyth::PythAdapter, switchboard::SwitchboardAdapter, custom::CustomAdapter};

/// Oracle provider type discriminator
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OracleProvider {
    Pyth = 0,
    Switchboard = 1,
    Custom = 2,
}

/// Create oracle adapter based on provider type
pub fn create_oracle_adapter(
    provider: OracleProvider,
    max_age_secs: i64,
    max_confidence_pct: u64,
) -> Box<dyn OracleAdapter> {
    match provider {
        OracleProvider::Pyth => Box::new(PythAdapter {
            max_confidence_pct,
            max_age_secs,
        }),
        OracleProvider::Switchboard => Box::new(SwitchboardAdapter {
            max_confidence_pct,
            max_age_secs,
        }),
        OracleProvider::Custom => Box::new(CustomAdapter {
            max_age_secs,
        }),
    }
}
```

**Tests**:
- Factory creates correct adapter type
- Dynamic dispatch works correctly

#### 1.6 Update SlabRegistry

**File**: `programs/router/src/state/registry.rs` (MODIFY)

```rust
pub struct SlabEntry {
    pub slab_id: Pubkey,
    pub version_hash: [u8; 32],
    pub oracle_id: Pubkey,
    pub oracle_provider: u8,  // NEW: OracleProvider discriminator
    pub imr: u64,
    pub mmr: u64,
    // ... rest unchanged
}

pub struct SlabRegistry {
    pub router_id: Pubkey,
    pub governance: Pubkey,
    pub slab_count: u16,
    pub oracle_tolerance_bps: u64,
    pub max_oracle_age_secs: i64,    // NEW: Max staleness threshold
    pub max_confidence_pct: u64,      // NEW: Max confidence %
    pub slabs: [SlabEntry; MAX_SLABS],
    // ... rest unchanged
}
```

**Migration**:
- Add default values for existing registries
- Update initialization to set oracle parameters

### Phase 1 Testing

**Unit Tests** (`tests/oracle_adapter_tests.rs`):
- Oracle price reading for each provider
- Staleness detection edge cases
- Confidence validation thresholds
- Price scaling accuracy
- Invalid account rejection

**Integration Tests** (`tests/oracle_integration_tests.rs`):
- Read from real Pyth mainnet account (snapshot)
- Read from real Switchboard mainnet account (snapshot)
- Custom oracle round-trip (write → read)
- Factory pattern with different providers

**Acceptance Criteria**:
- ✅ All 3 oracle providers pass unit tests
- ✅ Price scaling within 0.01% of reference values
- ✅ Staleness detection accurate to 1 second
- ✅ No heap allocations in hot path (use stack)
- ✅ Backward compatible with existing custom oracle

---

## Phase 2: Cross-Slab Oracle Alignment (Week 1-2)

### Objectives
- Enforce oracle alignment across slabs for same instrument
- Prevent basis risk from price divergence
- Add oracle alignment checks to execute_cross_slab

### Deliverables

#### 2.1 Oracle Alignment Validator

**File**: `programs/router/src/oracle/alignment.rs` (NEW)

```rust
use super::adapter::{OracleAdapter, OraclePrice};
use crate::state::SlabRegistry;

/// Validate oracle alignment across multiple slabs
///
/// Ensures all slabs trading the same instrument use:
/// 1. Same oracle account OR
/// 2. Different oracles within tolerance threshold
///
/// Returns the canonical oracle price to use for margin calculations
pub fn validate_cross_slab_alignment(
    oracle_accounts: &[&AccountInfo],
    oracle_providers: &[u8],
    registry: &SlabRegistry,
) -> Result<OraclePrice, OracleError> {
    if oracle_accounts.is_empty() {
        return Err(OracleError::InvalidAccount);
    }

    // Read all oracle prices
    let mut prices = Vec::with_capacity(oracle_accounts.len());
    for (i, oracle_account) in oracle_accounts.iter().enumerate() {
        let provider = OracleProvider::try_from(oracle_providers[i])
            .map_err(|_| OracleError::InvalidAccount)?;

        let adapter = create_oracle_adapter(
            provider,
            registry.max_oracle_age_secs,
            registry.max_confidence_pct,
        );

        // Validate account ownership
        adapter.validate_account(oracle_account)?;

        // Read price
        let price = adapter.read_price(oracle_account)?;

        // Check staleness
        if adapter.is_stale(price.timestamp, registry.max_oracle_age_secs) {
            return Err(OracleError::StalePrice);
        }

        prices.push(price);
    }

    // If all same oracle account, no alignment check needed
    let first_oracle = oracle_accounts[0].key();
    if oracle_accounts.iter().all(|acc| acc.key() == first_oracle) {
        return Ok(prices[0]);
    }

    // Multiple oracles: check alignment within tolerance
    let reference_price = prices[0].price;
    for price in &prices[1..] {
        let diff = (price.price - reference_price).abs();
        let tolerance = ((reference_price.abs() as u128 * registry.oracle_tolerance_bps as u128) / 10_000) as i64;

        if diff > tolerance {
            msg!(
                "Oracle alignment failed: {} vs {} (tolerance: {})",
                price.price,
                reference_price,
                tolerance
            );
            return Err(OracleError::MisalignedOracles);
        }
    }

    // Return VWAP of all oracle prices (simple average for v0)
    let avg_price = prices.iter().map(|p| p.price as i128).sum::<i128>() / prices.len() as i128;

    Ok(OraclePrice {
        price: avg_price as i64,
        confidence: prices.iter().map(|p| p.confidence).max().unwrap_or(0),
        timestamp: prices.iter().map(|p| p.timestamp).min().unwrap_or(0), // Use oldest timestamp (most conservative)
        expo: prices[0].expo,
    })
}

/// Error type extended
pub enum OracleError {
    // ... existing variants
    MisalignedOracles,
}
```

**Tests**:
- Same oracle across slabs (should pass)
- Aligned different oracles (within tolerance, should pass)
- Misaligned oracles (exceeds tolerance, should fail)
- One stale oracle (should fail entire batch)
- Mixed providers (Pyth + Switchboard aligned)

#### 2.2 Update execute_cross_slab

**File**: `programs/router/src/instructions/execute_cross_slab.rs` (MODIFY)

```rust
pub fn process_execute_cross_slab(
    portfolio: &mut Portfolio,
    user: &Pubkey,
    vault: &mut Vault,
    registry: &mut SlabRegistry,
    router_authority: &AccountInfo,
    slab_accounts: &[AccountInfo],
    receipt_accounts: &[AccountInfo],
    oracle_accounts: &[AccountInfo],  // NEW: Oracle accounts for alignment check
    splits: &[SlabSplit],
) -> Result<(), PercolatorError> {
    // Existing user touch and validation...

    // NEW: Phase 0 - Oracle Alignment Validation
    msg!("Validating oracle alignment across slabs");

    // Extract oracle provider types from slab registry
    let mut oracle_providers = Vec::with_capacity(slab_accounts.len());
    let mut oracle_refs = Vec::with_capacity(slab_accounts.len());

    for split in splits {
        // Find slab entry in registry
        let slab_entry = registry.find_slab(&split.slab_id)
            .ok_or(PercolatorError::SlabNotRegistered)?;

        oracle_providers.push(slab_entry.oracle_provider);

        // Find matching oracle account
        let oracle_account = oracle_accounts.iter()
            .find(|acc| acc.key() == &slab_entry.oracle_id)
            .ok_or(PercolatorError::OracleMissing)?;

        oracle_refs.push(oracle_account);
    }

    // Validate alignment and get canonical oracle price
    use crate::oracle::alignment::validate_cross_slab_alignment;
    let canonical_oracle_price = validate_cross_slab_alignment(
        &oracle_refs,
        &oracle_providers,
        registry,
    ).map_err(|_| PercolatorError::OracleMisaligned)?;

    msg!("Oracle alignment validated: price={}", canonical_oracle_price.price);

    // NEW: Update each slab's mark price before CPI
    for (i, slab_account) in slab_accounts.iter().enumerate() {
        update_slab_mark_price(
            slab_account,
            canonical_oracle_price.price,
        )?;
    }

    // Phase 1: Read QuoteCache... (existing code)

    // Phase 2: CPI to each slab... (existing code)

    // Phase 3: Aggregate fills and update portfolio... (existing code)

    // Phase 4: Calculate IM with ORACLE PRICE (MODIFIED)
    let net_exposure = calculate_net_exposure(portfolio);
    let im_required = calculate_initial_margin_with_oracle(
        net_exposure,
        canonical_oracle_price.price,  // Use oracle price, not stale split price
        registry,
    );

    msg!("Calculated margin on net exposure with oracle price");

    // Rest unchanged...
}

/// Update slab's cached mark price
fn update_slab_mark_price(
    slab_account: &AccountInfo,
    oracle_price: i64,
) -> Result<(), PercolatorError> {
    let mut slab_data = slab_account.try_borrow_mut_data()
        .map_err(|_| PercolatorError::InvalidAccount)?;

    if slab_data.len() < 96 {
        return Err(PercolatorError::InvalidAccount);
    }

    // mark_px is at offset 88 in SlabHeader (after program_id, lp_owner, router_id, instrument)
    slab_data[88..96].copy_from_slice(&oracle_price.to_le_bytes());

    Ok(())
}

/// Calculate margin using oracle price (MODIFIED)
fn calculate_initial_margin_with_oracle(
    net_exposure: i64,
    oracle_price: i64,
    registry: &SlabRegistry,
) -> u128 {
    use percolator_common::math::calculate_im;

    // Get IMR from registry (default 10% = 1000 bps)
    let imr_bps = 1000u64;

    // Contract size = 1.0 for v0 (1e6 scale)
    let contract_size = 1_000_000u64;

    calculate_im(net_exposure, contract_size, oracle_price as u64, imr_bps)
}
```

**Changes Required**:
1. Add `oracle_accounts` parameter to instruction
2. Add oracle alignment validation before CPI
3. Update slab mark prices before fills
4. Use oracle price in margin calculation (not stale split price)

**Tests**:
- Execute cross-slab with aligned oracles (should succeed)
- Execute cross-slab with misaligned oracles (should fail)
- Execute cross-slab with stale oracle (should fail)
- Verify slab mark prices updated correctly

#### 2.3 Update Instruction Serialization

**File**: `programs/router/src/instruction.rs` (MODIFY)

```rust
pub enum RouterInstruction {
    // ... existing variants

    /// Execute cross-slab order with oracle validation
    ///
    /// Accounts:
    /// 0. `[writable]` Portfolio
    /// 1. `[signer]` User
    /// 2. `[writable]` Vault
    /// 3. `[writable]` Registry
    /// 4. `[]` Router authority PDA
    /// 5..5+N. `[writable]` Slab accounts (N slabs)
    /// 5+N..5+2N. `[writable]` Receipt accounts (N receipts)
    /// 5+2N..5+3N. `[]` Oracle accounts (N oracles)  // NEW
    ///
    /// Data:
    /// - num_splits: u8
    /// - splits: [SlabSplit; num_splits]
    ExecuteCrossSlab {
        splits: Vec<SlabSplit>,
    },
}
```

### Phase 2 Testing

**Unit Tests**:
- Oracle alignment validator with various scenarios
- Mark price update in slab header
- Margin calculation with oracle price

**Integration Tests**:
- End-to-end cross-slab trade with oracle validation
- Rejection of misaligned oracles
- Mark price propagation to slabs

**Acceptance Criteria**:
- ✅ Oracle alignment enforced on every cross-slab trade
- ✅ Slab mark prices updated before fills
- ✅ Margin calculations use fresh oracle prices
- ✅ Backward compatible with single-slab trades
- ✅ Performance: < 50μs overhead for oracle validation

---

## Phase 3: Mark-to-Market PnL (Week 2)

### Objectives
- Calculate unrealized PnL using oracle mark prices
- Update portfolio equity in real-time
- Display accurate portfolio value to users

### Deliverables

#### 3.1 PnL Calculation with Oracle

**File**: `programs/router/src/portfolio/pnl.rs` (NEW)

```rust
use crate::state::Portfolio;
use crate::oracle::adapter::{OracleAdapter, OraclePrice};
use percolator_common::math::calculate_pnl;

/// Calculate mark-to-market unrealized PnL for portfolio
///
/// Iterates all positions, reads oracle prices, calculates PnL
pub fn calculate_portfolio_mtm_pnl(
    portfolio: &Portfolio,
    oracle_accounts: &[&AccountInfo],
    oracle_providers: &[u8],
    registry: &SlabRegistry,
) -> Result<i128, PercolatorError> {
    let mut total_unrealized_pnl = 0i128;

    for i in 0..portfolio.exposure_count as usize {
        let (slab_idx, instrument_idx, qty) = portfolio.exposures[i];

        if qty == 0 {
            continue; // No position, skip
        }

        // Get slab entry to find oracle and entry price
        let slab_entry = registry.get_slab(slab_idx)
            .ok_or(PercolatorError::SlabNotRegistered)?;

        // Find oracle account
        let oracle_account = oracle_accounts.iter()
            .find(|acc| acc.key() == &slab_entry.oracle_id)
            .ok_or(PercolatorError::OracleMissing)?;

        // Read current mark price
        let provider = OracleProvider::try_from(slab_entry.oracle_provider)
            .map_err(|_| PercolatorError::InvalidOracleProvider)?;

        let adapter = create_oracle_adapter(
            provider,
            registry.max_oracle_age_secs,
            registry.max_confidence_pct,
        );

        let oracle_price = adapter.read_price(oracle_account)
            .map_err(|_| PercolatorError::OracleReadFailed)?;

        // Get entry price for this position
        // For v0, we'll need to track this in Portfolio
        let entry_price = portfolio.get_entry_price(slab_idx, instrument_idx);

        // Calculate unrealized PnL
        let position_pnl = calculate_pnl(qty, entry_price, oracle_price.price as u64);

        total_unrealized_pnl += position_pnl;
    }

    Ok(total_unrealized_pnl)
}
```

#### 3.2 Update Portfolio State

**File**: `programs/router/src/state/portfolio.rs` (MODIFY)

```rust
pub struct Portfolio {
    pub user: Pubkey,
    pub router_id: Pubkey,
    pub principal: i128,         // Initial deposit (cash)
    pub pnl: i128,               // Realized PnL (existing)
    pub unrealized_pnl: i128,    // NEW: Mark-to-market unrealized PnL
    pub last_mark_ts: i64,       // NEW: Last mark-to-market timestamp
    pub equity: i128,            // Cash + realized PnL + unrealized PnL
    pub im: u128,
    pub mm: u128,

    // Position tracking
    pub exposures: [(u16, u16, i64); MAX_EXPOSURES],  // (slab_idx, instrument_idx, qty)
    pub entry_prices: [u64; MAX_EXPOSURES],           // NEW: Entry VWAP for each position
    pub exposure_count: u8,

    // ... rest unchanged
}

impl Portfolio {
    /// Update mark-to-market equity with fresh oracle prices
    pub fn update_equity_mtm(
        &mut self,
        unrealized_pnl: i128,
        timestamp: i64,
    ) {
        self.unrealized_pnl = unrealized_pnl;
        self.last_mark_ts = timestamp;
        self.equity = self.principal + self.pnl + self.unrealized_pnl;
    }

    /// Track entry price when opening/increasing position
    pub fn update_position_entry_price(
        &mut self,
        slab_idx: u16,
        instrument_idx: u16,
        new_qty: i64,
        fill_price: u64,
    ) {
        for i in 0..self.exposure_count as usize {
            if self.exposures[i].0 == slab_idx && self.exposures[i].1 == instrument_idx {
                let current_qty = self.exposures[i].2;
                let current_entry = self.entry_prices[i];

                // Update VWAP entry price
                if (current_qty > 0 && new_qty > 0) || (current_qty < 0 && new_qty < 0) {
                    // Same direction: update VWAP
                    let total_qty = current_qty.abs() + new_qty.abs();
                    let total_notional = (current_qty.abs() as u128 * current_entry as u128)
                        + (new_qty.abs() as u128 * fill_price as u128);
                    self.entry_prices[i] = (total_notional / total_qty as u128) as u64;
                } else if current_qty.signum() != new_qty.signum() {
                    // Opposite direction: closing or flipping
                    let net_qty = current_qty + new_qty;
                    if net_qty == 0 {
                        // Fully closed
                        self.entry_prices[i] = 0;
                    } else if net_qty.signum() == current_qty.signum() {
                        // Partial close, entry price unchanged
                    } else {
                        // Flipped direction, new entry price
                        self.entry_prices[i] = fill_price;
                    }
                }

                return;
            }
        }
    }

    /// Get entry price for position
    pub fn get_entry_price(&self, slab_idx: u16, instrument_idx: u16) -> u64 {
        for i in 0..self.exposure_count as usize {
            if self.exposures[i].0 == slab_idx && self.exposures[i].1 == instrument_idx {
                return self.entry_prices[i];
            }
        }
        0 // No position
    }
}
```

#### 3.3 Add MTM Update to execute_cross_slab

**File**: `programs/router/src/instructions/execute_cross_slab.rs` (MODIFY)

```rust
// After Phase 3: Aggregate fills and update portfolio
for (i, split) in splits.iter().enumerate() {
    let filled_qty = split.qty;
    let fill_price = split.limit_px as u64; // Use actual fill price from receipt in production

    let slab_idx = i as u16;
    let instrument_idx = 0u16;

    let current_exposure = portfolio.get_exposure(slab_idx, instrument_idx);
    let new_exposure = if split.side == 0 {
        current_exposure + filled_qty
    } else {
        current_exposure - filled_qty
    };

    portfolio.update_exposure(slab_idx, instrument_idx, new_exposure);

    // NEW: Update entry price for position tracking
    portfolio.update_position_entry_price(slab_idx, instrument_idx, filled_qty, fill_price);
}

// NEW: Calculate and update mark-to-market PnL
use crate::portfolio::pnl::calculate_portfolio_mtm_pnl;
let unrealized_pnl = calculate_portfolio_mtm_pnl(
    portfolio,
    &oracle_refs,
    &oracle_providers,
    registry,
)?;

portfolio.update_equity_mtm(unrealized_pnl, canonical_oracle_price.timestamp);

msg!("Portfolio equity updated with MTM PnL: {}", unrealized_pnl);
```

#### 3.4 CLI/SDK Integration

**File**: `cli/src/commands/portfolio.rs` (NEW)

```typescript
// Display portfolio with mark-to-market PnL
export async function showPortfolio(
  connection: Connection,
  portfolioAddress: PublicKey,
  oracleAddresses: PublicKey[]
) {
  const portfolio = await connection.getAccountInfo(portfolioAddress);
  const portfolioData = deserializePortfolio(portfolio.data);

  console.log("Portfolio Summary:");
  console.log(`  Principal: ${formatCurrency(portfolioData.principal)}`);
  console.log(`  Realized PnL: ${formatCurrency(portfolioData.pnl)}`);
  console.log(`  Unrealized PnL: ${formatCurrency(portfolioData.unrealizedPnl)}`);
  console.log(`  Total Equity: ${formatCurrency(portfolioData.equity)}`);
  console.log(`  IM Required: ${formatCurrency(portfolioData.im)}`);
  console.log(`  Free Collateral: ${formatCurrency(portfolioData.equity - portfolioData.im)}`);
  console.log(`  Last Mark: ${new Date(portfolioData.lastMarkTs * 1000).toISOString()}`);

  console.log("\nPositions:");
  for (let i = 0; i < portfolioData.exposureCount; i++) {
    const [slabIdx, instrumentIdx, qty] = portfolioData.exposures[i];
    const entryPrice = portfolioData.entryPrices[i];

    // Fetch current oracle price
    const oracleAccount = await connection.getAccountInfo(oracleAddresses[slabIdx]);
    const currentPrice = parseOraclePrice(oracleAccount.data);

    const unrealizedPnl = qty * (currentPrice - entryPrice);

    console.log(`  Slab ${slabIdx}, Instrument ${instrumentIdx}:`);
    console.log(`    Qty: ${qty}`);
    console.log(`    Entry: ${formatPrice(entryPrice)}`);
    console.log(`    Mark: ${formatPrice(currentPrice)}`);
    console.log(`    Unrealized PnL: ${formatCurrency(unrealizedPnl)}`);
  }
}
```

### Phase 3 Testing

**Unit Tests**:
- PnL calculation for long position (profit/loss)
- PnL calculation for short position (profit/loss)
- Entry price VWAP updates (increase, decrease, flip)
- Multiple positions across slabs

**Integration Tests**:
- Open position → mark to market → verify PnL
- Close position → verify realized PnL transfer
- Portfolio display via CLI

**Acceptance Criteria**:
- ✅ Unrealized PnL accurate to 0.01% vs manual calculation
- ✅ Entry price tracking handles all scenarios (open, increase, decrease, flip, close)
- ✅ Portfolio equity = principal + realized + unrealized
- ✅ CLI displays mark-to-market PnL correctly
- ✅ Performance: MTM calculation < 100μs per position

---

## Phase 4: Funding Rate Mechanism (Week 3)

### Objectives
- Calculate funding based on Mark Price vs Index Price divergence
- Apply funding to positions periodically
- Net funding cashflows across slabs at portfolio level

### Deliverables

#### 4.1 Funding Rate Calculation

**File**: `programs/router/src/funding/calculator.rs` (NEW)

```rust
/// Calculate funding rate based on premium/discount
///
/// funding_rate = (mark_price - index_price) / index_price * k
///
/// Where k is annualized funding scaling factor (e.g., 8 for 8-hour funding)
pub fn calculate_funding_rate(
    mark_price: i64,
    index_price: i64,
    funding_interval_hours: u64,  // e.g., 8 for 8-hour funding
) -> i64 {
    if index_price == 0 {
        return 0;
    }

    // Premium = (mark - index) / index
    let premium = ((mark_price - index_price) as i128 * 1_000_000) / index_price as i128;

    // Annualized funding (assuming 365 days)
    let periods_per_year = (365 * 24) / funding_interval_hours;

    // funding_rate = premium / periods_per_year (in basis points)
    let funding_rate_bps = (premium * 10_000) / periods_per_year as i128;

    funding_rate_bps as i64
}

/// Calculate funding payment for a position
///
/// payment = position_qty * position_notional * funding_rate
pub fn calculate_funding_payment(
    position_qty: i64,
    mark_price: i64,
    contract_size: u64,
    funding_rate_bps: i64,
) -> i128 {
    if position_qty == 0 {
        return 0;
    }

    // Notional = qty * contract_size * mark_price
    let notional = (position_qty.abs() as u128 * contract_size as u128 * mark_price.abs() as u128) / 1_000_000;

    // Payment = notional * funding_rate / 10000 (basis points)
    let payment = (notional as i128 * funding_rate_bps as i128) / 10_000;

    // Long pays positive funding, short receives
    if position_qty > 0 {
        -payment
    } else {
        payment
    }
}
```

**Tests**:
- Funding rate calculation with premium (mark > index)
- Funding rate calculation with discount (mark < index)
- Funding payment for long position (paying vs receiving)
- Funding payment for short position

#### 4.2 Update Instrument State

**File**: `programs/common/src/types.rs` (MODIFY)

```rust
pub struct Instrument {
    // ... existing fields
    pub index_price: u64,        // From oracle (spot price)
    pub mark_price: u64,         // From oracle or TWAP (perp price)  // RENAMED from index_price
    pub funding_rate: i64,       // Current funding rate (basis points)
    pub cum_funding: i128,       // Cumulative funding (for position tracking)
    pub last_funding_ts: u64,    // Last funding application timestamp
    pub next_funding_ts: u64,    // NEW: Next scheduled funding timestamp
    // ... rest unchanged
}
```

#### 4.3 Funding Application Instruction

**File**: `programs/router/src/instructions/apply_funding.rs` (NEW)

```rust
/// Apply funding to all positions for an instrument
///
/// This is called periodically (e.g., every 8 hours) by a crank
///
/// Accounts:
/// 0. `[writable]` Registry
/// 1. `[]` Oracle account (mark price)
/// 2. `[]` Oracle account (index price)
/// 3..N. `[writable]` Portfolio accounts (all active portfolios)
///
/// Data:
/// - instrument_idx: u16
pub fn process_apply_funding(
    registry: &mut SlabRegistry,
    mark_oracle_account: &AccountInfo,
    index_oracle_account: &AccountInfo,
    portfolio_accounts: &[AccountInfo],
    instrument_idx: u16,
) -> Result<(), PercolatorError> {
    use pinocchio::sysvars::{clock::Clock, Sysvar};

    let current_ts = Clock::get()
        .map(|clock| clock.unix_timestamp)
        .unwrap_or(0);

    // Get instrument from registry
    // For v0, we'll need to add instruments to registry
    // For now, use slab-level funding

    // Read oracle prices
    use crate::oracle::adapter::OracleAdapter;
    use crate::oracle::factory::create_oracle_adapter;

    let mark_adapter = create_oracle_adapter(
        OracleProvider::Pyth,  // Get from registry in production
        registry.max_oracle_age_secs,
        registry.max_confidence_pct,
    );

    let mark_oracle_price = mark_adapter.read_price(mark_oracle_account)
        .map_err(|_| PercolatorError::OracleReadFailed)?;

    let index_adapter = create_oracle_adapter(
        OracleProvider::Pyth,
        registry.max_oracle_age_secs,
        registry.max_confidence_pct,
    );

    let index_oracle_price = index_adapter.read_price(index_oracle_account)
        .map_err(|_| PercolatorError::OracleReadFailed)?;

    // Calculate funding rate
    use crate::funding::calculator::calculate_funding_rate;
    let funding_interval_hours = 8; // 8-hour funding
    let funding_rate = calculate_funding_rate(
        mark_oracle_price.price,
        index_oracle_price.price,
        funding_interval_hours,
    );

    msg!("Funding rate calculated: {} bps", funding_rate);

    // Apply funding to all portfolios with positions in this instrument
    for portfolio_account in portfolio_accounts {
        let mut portfolio_data = portfolio_account.try_borrow_mut_data()
            .map_err(|_| PercolatorError::InvalidAccount)?;

        let portfolio = unsafe { &mut *(portfolio_data.as_mut_ptr() as *mut Portfolio) };

        // Apply funding to matching positions
        for i in 0..portfolio.exposure_count as usize {
            let (slab_idx, instr_idx, qty) = portfolio.exposures[i];

            if instr_idx != instrument_idx || qty == 0 {
                continue;
            }

            // Calculate funding payment
            use crate::funding::calculator::calculate_funding_payment;
            let payment = calculate_funding_payment(
                qty,
                mark_oracle_price.price,
                1_000_000, // contract_size
                funding_rate,
            );

            // Apply to portfolio (realized PnL)
            portfolio.pnl += payment;
            portfolio.equity = portfolio.principal + portfolio.pnl + portfolio.unrealized_pnl;

            msg!("Applied funding: position_qty={}, payment={}", qty, payment);
        }
    }

    // Update cumulative funding in registry
    // For v0, track per-slab, in v1 move to instrument level

    Ok(())
}
```

#### 4.4 Funding Crank (Off-Chain)

**File**: `cli/src/crank/funding.ts` (NEW)

```typescript
import { Connection, PublicKey, Transaction } from '@solana/web3.js';

/**
 * Funding rate crank - runs every 8 hours
 */
export async function runFundingCrank(
  connection: Connection,
  registryAddress: PublicKey,
  markOracleAddress: PublicKey,
  indexOracleAddress: PublicKey,
  instrumentIdx: number
) {
  console.log(`[Funding Crank] Starting for instrument ${instrumentIdx}`);

  // Fetch all active portfolios (need indexing service in production)
  const portfolioAddresses = await fetchActivePortfolios(connection, registryAddress);

  console.log(`[Funding Crank] Found ${portfolioAddresses.length} active portfolios`);

  // Build apply_funding instruction
  const instruction = buildApplyFundingInstruction(
    registryAddress,
    markOracleAddress,
    indexOracleAddress,
    portfolioAddresses,
    instrumentIdx
  );

  // Send transaction
  const tx = new Transaction().add(instruction);
  const signature = await connection.sendTransaction(tx, [/* signer */]);

  await connection.confirmTransaction(signature);

  console.log(`[Funding Crank] Applied funding: ${signature}`);
}

/**
 * Run crank continuously
 */
export async function startFundingCrankService(
  connection: Connection,
  config: FundingCrankConfig
) {
  const intervalMs = config.fundingIntervalHours * 60 * 60 * 1000;

  console.log(`[Funding Crank] Starting service (interval: ${config.fundingIntervalHours}h)`);

  setInterval(async () => {
    try {
      await runFundingCrank(
        connection,
        config.registryAddress,
        config.markOracleAddress,
        config.indexOracleAddress,
        config.instrumentIdx
      );
    } catch (error) {
      console.error(`[Funding Crank] Error:`, error);
    }
  }, intervalMs);
}
```

### Phase 4 Testing

**Unit Tests**:
- Funding rate calculation (various premiums/discounts)
- Funding payment calculation (long/short positions)
- Cumulative funding updates

**Integration Tests**:
- Apply funding to multiple portfolios
- Net funding across slabs (long slab A + short slab B = minimal funding)
- Funding crank end-to-end

**Acceptance Criteria**:
- ✅ Funding rate accurate to 0.01 bps vs reference calculation
- ✅ Funding payments sum to zero across all positions (conservation)
- ✅ Cross-slab netting reduces funding exposure
- ✅ Crank runs reliably every 8 hours
- ✅ Performance: Funding application < 1ms per portfolio

---

## Phase 5: Liquidation Oracle Integration (Week 3-4)

### Objectives
- Replace hardcoded oracle reading with adapter layer
- Add oracle alignment validation to liquidations
- Implement price band enforcement with oracle prices

### Deliverables

#### 5.1 Update liquidate_user Instruction

**File**: `programs/router/src/instructions/liquidate_user.rs` (REFACTOR)

```rust
// BEFORE: Hardcoded byte offset reading
for (i, oracle_account) in oracle_accounts.iter().enumerate() {
    let oracle_data = oracle_account.try_borrow_data()?;
    let price_bytes = [oracle_data[72], ..., oracle_data[79]];
    let price = i64::from_le_bytes(price_bytes);
    // ...
}

// AFTER: Use oracle adapter
use crate::oracle::adapter::OracleAdapter;
use crate::oracle::factory::create_oracle_adapter;

for (i, oracle_account) in oracle_accounts.iter().enumerate() {
    // Get oracle provider from registry
    let slab_entry = &registry.slabs[i];
    let provider = OracleProvider::try_from(slab_entry.oracle_provider)
        .map_err(|_| PercolatorError::InvalidOracleProvider)?;

    // Create adapter
    let adapter = create_oracle_adapter(
        provider,
        registry.max_oracle_age_secs,
        registry.max_confidence_pct,
    );

    // Read oracle price
    let oracle_price = adapter.read_price(oracle_account)
        .map_err(|_| PercolatorError::OracleReadFailed)?;

    // Validate staleness
    if adapter.is_stale(oracle_price.timestamp, registry.max_oracle_age_secs) {
        return Err(PercolatorError::OracleStale);
    }

    oracle_prices[oracle_count] = OraclePrice {
        instrument_idx: i as u16,
        price: oracle_price.price,
    };
    oracle_count += 1;
}
```

#### 5.2 Oracle Alignment in Liquidations

```rust
// Before calculating liquidation, validate oracle alignment
use crate::oracle::alignment::validate_cross_slab_alignment;

let canonical_oracle_price = validate_cross_slab_alignment(
    oracle_accounts,
    &oracle_providers,
    registry,
).map_err(|_| PercolatorError::OracleMisaligned)?;

// Use canonical price for liquidation threshold checks
let equity_after_mtm = portfolio.principal + portfolio.pnl + calculate_portfolio_mtm_pnl(
    portfolio,
    oracle_accounts,
    &oracle_providers,
    registry,
)?;

if equity_after_mtm >= portfolio.mm {
    msg!("Portfolio above maintenance margin, liquidation aborted");
    return Ok(()); // Not liquidatable
}
```

#### 5.3 Price Band Enforcement

```rust
// Use oracle-based price bands for liquidation sweeps
use crate::liquidation::oracle::calculate_price_band;

for position in liquidation_plan.positions {
    let slab_entry = &registry.slabs[position.slab_idx as usize];

    // Get oracle price for this slab
    let oracle_account = &oracle_accounts[position.slab_idx as usize];
    let adapter = create_oracle_adapter(
        OracleProvider::try_from(slab_entry.oracle_provider)?,
        registry.max_oracle_age_secs,
        registry.max_confidence_pct,
    );

    let oracle_price = adapter.read_price(oracle_account)?;

    // Calculate price band (e.g., ±2% from oracle)
    let band_bps = 200; // 2%
    let (lower_bound, upper_bound) = calculate_price_band(oracle_price.price, band_bps);

    // Determine limit price based on position side
    let limit_price = if position.qty > 0 {
        // Closing long: sell, use lower bound
        lower_bound
    } else {
        // Closing short: buy, use upper bound
        upper_bound
    };

    msg!("Liquidating position: qty={}, limit_price={}", position.qty, limit_price);

    // Execute liquidation with price band...
}
```

### Phase 5 Testing

**Unit Tests**:
- Oracle adapter usage in liquidations
- Staleness rejection
- Price band calculation

**Integration Tests**:
- Liquidation with Pyth oracle
- Liquidation with Switchboard oracle
- Liquidation with misaligned oracles (should fail)

**Acceptance Criteria**:
- ✅ All oracle providers work in liquidations
- ✅ Stale oracle prevents liquidation
- ✅ Price bands enforce safe liquidation prices
- ✅ Backward compatible with custom oracle

---

## Phase 6: Testing & Documentation (Week 4)

### Comprehensive Test Suite

#### 6.1 Property-Based Tests

**File**: `tests/oracle_property_tests.rs`

```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn test_oracle_alignment_transitive(
        price1 in 45_000_000_000i64..55_000_000_000i64,  // $45k-$55k
        tolerance_bps in 10u64..100u64,                   // 0.1%-1%
    ) {
        // Property: If price2 aligns with price1, and price3 aligns with price1,
        // then price2 aligns with price3 (within 2x tolerance)

        let price2 = price1 + (price1 * tolerance_bps as i64) / 20000; // Within tolerance
        let price3 = price1 - (price1 * tolerance_bps as i64) / 20000; // Within tolerance

        // All should align with each other
        assert!(validate_oracle_alignment(price1, price2, tolerance_bps));
        assert!(validate_oracle_alignment(price1, price3, tolerance_bps));
        assert!(validate_oracle_alignment(price2, price3, tolerance_bps * 2));
    }

    #[test]
    fn test_funding_conservation(
        mark_price in 45_000_000_000i64..55_000_000_000i64,
        index_price in 45_000_000_000i64..55_000_000_000i64,
        long_qty in 1i64..1_000_000i64,
    ) {
        // Property: Total funding payments across long + equal short = 0

        let funding_rate = calculate_funding_rate(mark_price, index_price, 8);

        let long_payment = calculate_funding_payment(long_qty, mark_price, 1_000_000, funding_rate);
        let short_payment = calculate_funding_payment(-long_qty, mark_price, 1_000_000, funding_rate);

        // Sum should be zero (within rounding error)
        assert!((long_payment + short_payment).abs() <= 1);
    }
}
```

#### 6.2 Chaos Tests

**File**: `tests/oracle_chaos_tests.rs`

```rust
/// Simulate oracle failures and verify graceful degradation
#[test]
fn test_oracle_failure_modes() {
    // Scenario 1: One oracle stale, others fresh
    // Expected: Reject entire trade

    // Scenario 2: Oracle price spike (10x in 1 second)
    // Expected: Circuit breaker triggers

    // Scenario 3: Oracle confidence too wide (> 5%)
    // Expected: Reject price

    // Scenario 4: Network partition, oracle unreachable
    // Expected: Timeout, use last known good price with degraded mode flag
}
```

#### 6.3 Economic Simulation Tests

**File**: `tests/oracle_economic_tests.rs`

```rust
/// Simulate real trading scenarios and verify oracle integration
#[test]
fn test_capital_efficiency_with_oracles() {
    // Setup: Long $100k BTC on Slab A, Short $100k BTC on Slab B
    // Oracle price: $50,000

    // Execute trades with oracle validation
    execute_cross_slab_with_oracles(...);

    // Verify:
    // 1. Net exposure = 0
    // 2. IM required ~= $0 (within small buffer)
    // 3. Unrealized PnL tracks correctly as oracle price changes

    // Change oracle price to $51,000
    update_oracle_price(...);

    // Verify:
    // - Long position: +$2,000 unrealized PnL
    // - Short position: -$2,000 unrealized PnL
    // - Net unrealized PnL: $0
    // - Portfolio equity unchanged (basis-free!)
}

#[test]
fn test_funding_rate_convergence() {
    // Setup: Mark price = $51,000, Index price = $50,000 (1% premium)

    // Apply funding over 24 hours (3x 8-hour funding)
    for _ in 0..3 {
        apply_funding(...);
    }

    // Verify:
    // - Long pays premium
    // - Short receives premium
    // - Total payments sum to zero
    // - After funding, incentive to arbitrage reduces premium
}
```

### Documentation

#### 6.4 Oracle Integration Guide

**File**: `docs/oracle_integration.md` (NEW)

```markdown
# Oracle Integration Guide

## Supported Oracle Providers

### Pyth Network (Mainnet Production)
- **Program ID**: `FsJ3A3u2vn5cTVofAjvy6y5kwABJAqYWpe4975bi2epH`
- **Price Feeds**: https://pyth.network/price-feeds
- **Confidence Threshold**: < 2% of price
- **Staleness Threshold**: 60 seconds

### Switchboard (Mainnet Fallback)
- **Program ID**: `SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStViMFnt64f`
- **Feeds**: https://switchboard.xyz/explorer
- **Confidence Threshold**: < 2% of price
- **Staleness Threshold**: 60 seconds

### Custom Oracle (Devnet/Localnet Testing)
- **Program ID**: Deployed custom oracle program
- **Update Mechanism**: Authority-controlled manual updates
- **Format**: 128-byte PriceOracle struct

## Integration Checklist

- [ ] Add oracle addresses to SlabRegistry
- [ ] Set oracle provider type (Pyth/Switchboard/Custom)
- [ ] Configure staleness threshold (default: 60s)
- [ ] Configure confidence threshold (default: 2%)
- [ ] Configure alignment tolerance (default: 0.5%)
- [ ] Test oracle reading in devnet
- [ ] Test cross-slab alignment validation
- [ ] Test liquidation with oracle prices
- [ ] Deploy funding crank service
- [ ] Monitor oracle uptime and staleness metrics

## Monitoring

### Key Metrics
1. **Oracle Staleness**: % of trades rejected due to stale oracle
2. **Oracle Misalignment**: % of cross-slab trades rejected due to misalignment
3. **Funding Rate History**: Track premium/discount over time
4. **Liquidation Price Impact**: Oracle price vs execution price during liquidations

### Alerts
- Alert if oracle not updated for > 30 seconds
- Alert if cross-slab alignment fails > 5% of trades
- Alert if funding rate > 10% annualized (extreme premium)
- Alert if liquidation price band exceeds ±5%

## Troubleshooting

### Issue: "Oracle price stale"
**Cause**: Oracle not updated recently
**Solution**: Check oracle provider uptime, consider fallback oracle

### Issue: "Oracle misaligned across slabs"
**Cause**: Different slabs using different oracles or stale cache
**Solution**: Verify all slabs use same oracle, increase tolerance threshold temporarily

### Issue: "Funding rate extremely high"
**Cause**: Large divergence between mark and index price
**Solution**: Normal behavior during high volatility, arbitrageurs will converge prices

## Migration from Custom to Production Oracles

1. Deploy Pyth/Switchboard adapters to devnet
2. Test with small positions
3. Gradually migrate slabs to production oracles
4. Monitor for 7 days in devnet
5. Deploy to mainnet with conservative thresholds
6. Gradually relax thresholds based on observed performance
```

#### 6.5 Code Documentation

Add comprehensive rustdoc comments to all public APIs:

```rust
/// Oracle adapter trait for reading prices from different providers
///
/// # Examples
///
/// ```rust
/// use percolator_router::oracle::adapter::OracleAdapter;
/// use percolator_router::oracle::pyth::PythAdapter;
///
/// let adapter = PythAdapter {
///     max_confidence_pct: 2,
///     max_age_secs: 60,
/// };
///
/// let price = adapter.read_price(oracle_account)?;
/// println!("Current price: {}", price.price);
/// ```
///
/// # Safety
///
/// Oracle prices should always be validated for:
/// - Staleness (timestamp within max_age_secs)
/// - Confidence (within acceptable threshold)
/// - Account ownership (prevent oracle spoofing)
pub trait OracleAdapter {
    // ...
}
```

---

## Risk Assessment & Mitigation

### Technical Risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| **Oracle downtime** | High | Medium | Implement fallback oracles, circuit breakers |
| **Price manipulation** | Critical | Low | Use multiple oracle sources, validate confidence |
| **Staleness in high volatility** | High | Medium | Tight staleness thresholds, monitoring alerts |
| **Cross-slab misalignment** | Critical | Low | Strict alignment validation, reject trades early |
| **Funding rate calculation errors** | Medium | Low | Comprehensive unit tests, property-based tests |
| **Performance degradation** | Medium | Medium | Oracle price caching, batch reads |

### Operational Risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| **Funding crank downtime** | Medium | Medium | Redundant crank services, monitoring |
| **Incorrect oracle configuration** | High | Low | Configuration validation, staging tests |
| **Oracle provider changes format** | Medium | Low | Version checks, adapter abstraction |
| **Network congestion delays oracle updates** | Medium | High | Increase staleness threshold during congestion |

---

## Success Metrics

### Phase 1 (Oracle Adapter)
- ✅ Support 3 oracle providers (Pyth, Switchboard, Custom)
- ✅ Oracle read latency < 10μs
- ✅ 100% backward compatibility with existing liquidations

### Phase 2 (Cross-Slab Alignment)
- ✅ Zero cross-slab trades with misaligned oracles
- ✅ Alignment validation overhead < 50μs
- ✅ Slab mark prices updated on every trade

### Phase 3 (Mark-to-Market PnL)
- ✅ Unrealized PnL accurate to 0.01%
- ✅ Portfolio equity = principal + realized + unrealized
- ✅ CLI displays real-time PnL

### Phase 4 (Funding Rates)
- ✅ Funding rate calculation matches reference (e.g., Binance)
- ✅ Funding payments sum to zero across all positions
- ✅ Crank uptime > 99.9%

### Phase 5 (Liquidations)
- ✅ All oracle providers work in liquidations
- ✅ Liquidation price bands enforce safe execution
- ✅ Zero liquidations with stale oracles

### Phase 6 (Testing & Docs)
- ✅ Property-based tests pass 10,000 iterations
- ✅ Economic simulations validate capital efficiency
- ✅ Comprehensive documentation published

---

## Dependencies

### Rust Crates
```toml
[dependencies]
pyth-sdk-solana = "0.10"
switchboard-solana = "0.29"
pinocchio = "0.5"
```

### External Services
- Pyth Network price feeds (mainnet)
- Switchboard aggregators (mainnet)
- Oracle monitoring service (custom or third-party)
- Funding crank infrastructure (cloud or on-prem)

---

## Timeline Summary

| Phase | Duration | Dependencies | Risk |
|-------|----------|--------------|------|
| **Phase 1: Oracle Adapter** | Week 1 | None | Low |
| **Phase 2: Cross-Slab Alignment** | Week 1-2 | Phase 1 | Medium |
| **Phase 3: Mark-to-Market PnL** | Week 2 | Phase 2 | Low |
| **Phase 4: Funding Rates** | Week 3 | Phase 3 | Medium |
| **Phase 5: Liquidation Integration** | Week 3-4 | Phase 2 | Low |
| **Phase 6: Testing & Docs** | Week 4 | All phases | Low |

**Total Estimated Effort**: 3-4 weeks (1 engineer)

---

## Next Steps

1. Review this plan with team for approval
2. Prioritize phases based on business requirements
3. Set up development environment with Pyth/Switchboard accounts
4. Begin Phase 1 implementation
5. Establish monitoring infrastructure for oracles
6. Plan mainnet migration strategy

---

**Document Owner**: Engineering Team
**Last Reviewed**: 2025-01-24
**Next Review**: Before Phase 1 kickoff
