# Pyth Oracle Integration Status

**Date**: 2025-01-24
**Status**: ⚠️ Partial - Custom Oracle Only
**Branch**: oracle-cli-integration

---

## Summary

Oracle infrastructure has been implemented with support for Custom oracle (localnet/devnet testing). **Pyth integration is blocked** by AccountInfo type incompatibility between pinocchio and solana_program crates.

---

## What's Been Implemented

### ✅ Oracle Adapter Architecture

Created unified oracle interface in `programs/router/src/oracle/`:

**`adapter.rs`** - Trait definition:
```rust
pub trait OracleAdapter {
    fn read_price(&self, oracle_account: &AccountInfo) -> Result<OraclePrice, OracleError>;
    fn validate_account(&self, oracle_account: &AccountInfo) -> Result<(), OracleError>;
    fn is_stale(&self, timestamp: i64, max_age_secs: i64) -> bool;
    fn provider_name(&self) -> &'static str;
}
```

**`OraclePrice`** - Standardized format (all prices normalized to 1e6 scale):
```rust
pub struct OraclePrice {
    pub price: i64,           // e.g., $50,000 = 50_000_000_000
    pub confidence: i64,       // ±confidence interval
    pub timestamp: i64,        // Unix timestamp
    pub expo: i32,             // Original exponent (for reference)
}
```

### ✅ Custom Oracle Adapter

**File**: `programs/router/src/oracle/custom.rs`

Fully functional adapter for reading from our custom test oracle (`programs/oracle/`):

- Reads price from offset 80 (i64, 1e6 scale)
- Reads timestamp from offset 88
- Reads confidence from offset 96
- Validates magic bytes ("PRCLORCL")
- Checks staleness (default 60s max age)
- No external dependencies required

**Works in**:
- ✅ Localnet
- ✅ Devnet (with deployed custom oracle)

### ✅ Oracle CLI Management (Keeper)

**Location**: `keeper/src/oracle/`

Rust-based CLI for managing custom oracles:

```bash
# Initialize oracle
percolator-keeper oracle init --instrument BTC-PERP --price 50000

# Update oracle manually
percolator-keeper oracle update --oracle <ADDR> --price 51000

# Show oracle info
percolator-keeper oracle show --oracle <ADDR>

# Automated price crank (CoinGecko, Binance, Coinbase)
percolator-keeper oracle crank \
  --oracle <ADDR> \
  --instrument BTC/USD \
  --interval 5 \
  --source coingecko
```

**Components**:
- `keeper/src/oracle/commands.rs` - Init, update, show implementations
- `keeper/src/oracle/price_sources.rs` - External API integration
- `keeper/Cargo.toml` - Dependencies (reqwest, chrono, clap)

---

## ⚠️ Pyth Integration - Blocked

### The Problem

**File**: `programs/router/src/oracle/pyth.rs`

The Pyth SDK (`pyth-sdk-solana`) expects `solana_program::account_info::AccountInfo<'a>`, but Barista DEX router uses `pinocchio::AccountInfo` for efficiency and smaller binary size.

**Type Incompatibility**:
```rust
// Pyth SDK expects:
use solana_program::account_info::AccountInfo;  // ~300 bytes

// We use:
use pinocchio::account_info::AccountInfo;        // ~150 bytes

// These are DIFFERENT types with different layouts!
```

**Error**:
```
error[E0308]: mismatched types
  --> programs/router/src/oracle/pyth.rs:74:60
   |
74 |         let price_feed = load_price_feed_from_account_info(oracle_account)
   |                                                            ^^^^^^^^^^^^^^
   |                          expected `&AccountInfo<'_>`, found `&AccountInfo`
```

### Current Workaround

Pyth adapter is **stubbed** with TODOs:
```rust
impl OracleAdapter for PythAdapter {
    fn read_price(&self, _oracle_account: &AccountInfo) -> Result<OraclePrice, OracleError> {
        // TODO: Implement full Pyth integration once AccountInfo compatibility is resolved
        Err(OracleError::InvalidAccount)
    }
}
```

`provider_name()` returns: `"Pyth (Not Implemented - Use Custom Oracle)"`

### Solutions

**Option 1: Manual Pyth Account Parsing** (Recommended for now)
- Parse Pyth account data manually without SDK
- Pyth V2 format is documented: https://docs.pyth.network/price-feeds/how-pyth-works/account-structure
- Requires understanding Pyth's binary format
- More work upfront, but avoids dependency issues
- **Estimated effort**: 2-3 days

**Option 2: AccountInfo Conversion Layer**
- Create conversion from `pinocchio::AccountInfo` → `solana_program::account_info::AccountInfo`
- Requires unsafe code and careful memory layout matching
- Risk of bugs due to type system bypass
- **Estimated effort**: 1-2 days + testing

**Option 3: Switch Router to solana_program** (Not recommended)
- Replace pinocchio with standard solana_program types
- Increases binary size significantly (~50KB+)
- Defeats purpose of using pinocchio
- **Not recommended**

---

## Production Requirements

From `thoughts/ORACLE_INTEGRATION_PLAN.md`:

### For Mainnet Launch

**Must-have**:
1. ✅ Oracle adapter trait (done)
2. ⚠️ Pyth adapter (blocked - see above)
3. ⏳ Oracle reading in `execute_cross_slab` (pending)
4. ⏳ Mark-to-market PnL using oracle prices (pending)
5. ⏳ Cross-slab oracle alignment validation (pending)
6. ⏳ Margin calculations with fresh oracle prices (pending)

**Nice-to-have**:
- Switchboard adapter (alternative oracle)
- Funding rate mechanism
- Oracle staleness monitoring/alerts

### For Devnet Testing (Current)

**Working**:
- ✅ Custom oracle with CLI management
- ✅ Automated price crank (CoinGecko, Binance, Coinbase)
- ✅ Price staleness detection
- ✅ Confidence interval validation

**Limitations**:
- ⚠️ No Pyth integration
- ⏳ Oracles not yet read by Router in normal operations
- ⏳ Only used in liquidation path currently

---

## Next Steps

### Immediate (This Sprint)

1. **Implement Pyth Manual Parsing** (Option 1 above)
   - Study Pyth V2 account format
   - Implement binary deserialization in `pyth.rs`
   - Test with devnet Pyth feeds
   - **Priority**: High (blocking devnet Pyth usage)

2. **Integrate Oracle Reading into Router**
   - Add oracle account parameter to `execute_cross_slab`
   - Read oracle price before executing trades
   - Validate oracle alignment across slabs
   - Update margin calculations with fresh prices
   - **Priority**: High (core functionality)

3. **Add Cross-Slab Oracle Validation**
   - Ensure all slabs in a cross-slab trade use aligned oracles
   - Reject trades if oracles differ or basis risk exists
   - **Priority**: Medium (capital efficiency protection)

### Medium Term (Next Sprint)

4. **Mark-to-Market PnL**
   - Calculate unrealized PnL using oracle prices
   - Update portfolio equity in real-time
   - Display in CLI/SDK
   - **Priority**: Medium (user experience)

5. **Funding Rate Mechanism**
   - Calculate premium/discount (Mark - Index)
   - Apply funding payments periodically
   - Net funding across slabs at Router level
   - **Priority**: Medium (perp mechanism)

6. **Testing & Documentation**
   - Unit tests for oracle adapters
   - Integration tests with devnet Pyth feeds
   - Update user documentation
   - **Priority**: Medium (quality)

---

## DevNet Pyth Feeds

**Pyth Program ID** (Devnet): `gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s`

**Common Feed IDs** (Devnet):
- BTC/USD: `0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43`
- ETH/USD: `0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace`
- SOL/USD: `0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d`

**Full list**: https://pyth.network/developers/price-feed-ids#solana-devnet

Once Pyth manual parsing is implemented, these feeds can be used directly.

---

## Files Changed

### Router Program
```
programs/router/
├── src/
│   └── oracle/
│       ├── mod.rs          # Module definition
│       ├── adapter.rs      # OracleAdapter trait + OraclePrice
│       ├── custom.rs       # Custom oracle adapter (WORKING)
│       └── pyth.rs         # Pyth adapter (STUBBED - TODO)
├── Cargo.toml              # Dependencies (pyth-sdk commented out)
└── src/lib.rs              # Added oracle module
```

### Keeper Binary
```
keeper/
├── src/
│   └── oracle/
│       ├── mod.rs           # Oracle module
│       ├── commands.rs      # init, update, show, crank
│       └── price_sources.rs # CoinGecko, Binance, Coinbase
├── Cargo.toml               # Added reqwest, chrono, clap
└── README.md                # Usage documentation
```

### Documentation
```
thoughts/
├── ORACLE_INTEGRATION_PLAN.md           # Full 6-phase plan
├── ORACLE_LOCALNET_DEVNET_GUIDE.md      # Setup guide
├── ORACLE_CLI_IMPLEMENTATION_SUMMARY.md # CLI reference
└── PYTH_INTEGRATION_STATUS.md           # This file
```

---

## Recommendations

### For Immediate Devnet Testing

**Use Custom Oracle**:
1. Deploy custom oracle program to devnet
2. Initialize oracles for BTC-PERP, ETH-PERP, SOL-PERP
3. Run `percolator-keeper oracle crank` for each instrument
4. Oracle prices update every 5 seconds from CoinGecko

This provides realistic price data for devnet testing without Pyth dependency.

### For Mainnet Preparation

**Implement Pyth Manual Parsing**:
- Cannot launch mainnet without production oracle (Pyth/Switchboard)
- Custom oracle is test-only (authority-controlled, not decentralized)
- Manual parsing avoids AccountInfo compatibility issues
- Once working, can switch seamlessly from custom → Pyth

**Timeline**:
- Pyth manual parsing: 2-3 days
- Router integration: 1-2 days
- Testing: 2-3 days
- **Total**: ~1 week to full Pyth devnet support

---

## Questions?

- **Custom oracle setup**: See [ORACLE_LOCALNET_DEVNET_GUIDE.md](./ORACLE_LOCALNET_DEVNET_GUIDE.md)
- **CLI usage**: See [ORACLE_CLI_IMPLEMENTATION_SUMMARY.md](./ORACLE_CLI_IMPLEMENTATION_SUMMARY.md)
- **Production roadmap**: See [ORACLE_INTEGRATION_PLAN.md](./ORACLE_INTEGRATION_PLAN.md)
- **Keeper documentation**: See [../keeper/README.md](../keeper/README.md)

---

**Status**: Custom oracle fully functional. Pyth integration blocked by AccountInfo type incompatibility - manual parsing required.
