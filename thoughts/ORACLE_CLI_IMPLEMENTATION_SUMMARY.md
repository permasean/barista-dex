# Oracle CLI Implementation - Complete Summary

**Implementation Date**: 2025-01-24
**Status**: ✅ Completed (Phase 1 - Custom Oracle for Localnet/Devnet)
**Location**: `keeper/src/oracle/` (Rust)

---

## What Was Implemented

We've successfully implemented **custom oracle management for localnet and devnet testing**. This provides a complete oracle infrastructure for development and testing before integrating production oracles (Pyth/Switchboard) in the future.

### Components Created

#### 1. Oracle CLI Commands

**Location**: `keeper/src/oracle/commands.rs`

- **`init_oracle()`** - Initialize new custom oracle
- **`update_oracle()`** - Update oracle price manually
- **`show_oracle()`** - Display oracle information

#### 2. Oracle Crank Service

**Location**: `keeper/src/main.rs` (crank command implementation)

- Automated price fetching from external APIs
- Continuous oracle updates with configurable intervals
- Supports CoinGecko, Binance, and Coinbase

#### 3. Price Source Integration

**Location**: `keeper/src/oracle/price_sources.rs`

- HTTP client integration with reqwest
- JSON parsing for CoinGecko, Binance, and Coinbase APIs
- Instrument name mapping

#### 4. CLI Integration

**Location**: `keeper/src/cli.rs` and `keeper/src/main.rs`

- Registered all oracle commands under `percolator-keeper oracle`
- Uses clap for command-line argument parsing

---

## CLI Commands Reference

### Initialize Oracle

```bash
percolator-keeper oracle init \
  --instrument BTC-PERP \
  --price 50000 \
  --rpc-url http://localhost:8899
```

**Options**:
- `-i, --instrument <name>` (required) - Instrument name (e.g., BTC-PERP)
- `-p, --price <price>` (required) - Initial price (e.g., 50000)
- `-r, --rpc-url <url>` - RPC URL (default: http://localhost:8899)
- `-k, --keypair <path>` - Path to payer keypair file
- `-a, --authority <path>` - Path to authority keypair (defaults to payer)
- `--oracle-program <pubkey>` - Oracle program ID (optional)

**Output**:
```
✅ Oracle initialized successfully!

Oracle Details:
  Address: 7xK8...9mNv
  Instrument: BTC-PERP
  Initial Price: $50,000
  Authority: 3Qz4...7pLm

💡 Tip: Set BARISTA_ORACLE environment variable:
  export BARISTA_ORACLE=7xK8...9mNv
```

### Update Oracle Price

```bash
percolator-keeper oracle update \
  --oracle 7xK8...9mNv \
  --price 51000 \
  --rpc-url http://localhost:8899
```

**Options**:
- `-o, --oracle <address>` (required) - Oracle account address
- `-p, --price <price>` (required) - New price (e.g., 51000)
- `-c, --confidence <amount>` - Confidence interval (±amount, defaults to 0.1% of price)
- `-r, --rpc-url <url>` - RPC URL (default: http://localhost:8899)
- `-k, --keypair <path>` - Path to payer keypair file
- `-a, --authority <path>` - Path to authority keypair (defaults to payer)
- `--oracle-program <pubkey>` - Oracle program ID (optional)

**Output**:
```
✅ Oracle price updated successfully!

Updated Details:
  Oracle: 7xK8...9mNv
  New Price: $51,000
  Confidence: ±$51.00
  Timestamp: 2025-01-24T10:30:00.000Z
```

### Show Oracle Info

```bash
percolator-keeper oracle show \
  --oracle 7xK8...9mNv \
  --rpc-url http://localhost:8899
```

**Options**:
- `-o, --oracle <address>` (required) - Oracle account address
- `-r, --rpc-url <url>` - RPC URL (default: http://localhost:8899)

**Output**:
```
═══════════════════════════════════════════════════
                  ORACLE INFORMATION
═══════════════════════════════════════════════════

🔧 Metadata
  Magic:       PRCLORCL
  Version:     0
  Bump:        255

🔑 Accounts
  Authority:   3Qz4...7pLm
  Instrument:  8nB2...4kXy

💰 Price Data
  Price:       $51,000.00
  Confidence:  ±$51.00
  Timestamp:   2025-01-24T10:30:00.000Z
  Age:         2m 15s ago

═══════════════════════════════════════════════════
```

### Start Oracle Crank

```bash
percolator-keeper oracle crank \
  --oracle 7xK8...9mNv \
  --instrument BTC/USD \
  --rpc-url http://localhost:8899 \
  --interval 5 \
  --source coingecko
```

**Options**:
- `-o, --oracle <address>` (required) - Oracle account address
- `-i, --instrument <name>` (required) - Instrument name (e.g., BTC-PERP, ETH/USD)
- `-r, --rpc-url <url>` - RPC URL (default: http://localhost:8899)
- `-k, --keypair <path>` - Path to payer keypair file
- `-a, --authority <path>` - Path to authority keypair (defaults to payer)
- `--oracle-program <pubkey>` - Oracle program ID (optional)
- `--interval <seconds>` - Update interval in seconds (default: 5)
- `-s, --source <source>` - Price source: coingecko, binance, or coinbase (default: coingecko)

**Output**:
```
═══════════════════════════════════════════════════
            ORACLE CRANK SERVICE
═══════════════════════════════════════════════════

🔧 Configuration:
  Oracle:      7xK8...9mNv
  Instrument:  BTC/USD
  Network:     localnet
  Price Source: coingecko
  Update Interval: 5s

🚀 Starting crank service...
   Press Ctrl+C to stop

[2025-01-24T10:30:00.000Z] Fetched BTC/USD: $51,234.56
✅ Oracle price updated successfully!

[2025-01-24T10:30:05.000Z] Fetched BTC/USD: $51,245.78
✅ Oracle price updated successfully!

...
```

---

## Quick Start Guide

### Scenario 1: Manual Oracle Management

```bash
# 1. Start local validator
solana-test-validator

# 2. Initialize oracle for BTC
percolator-keeper oracle init \
  --instrument BTC-PERP \
  --price 50000 \
  --rpc-url http://localhost:8899

# Save the oracle address from output
export BARISTA_ORACLE=<ORACLE_ADDRESS>

# 3. Manually update price
percolator-keeper oracle update \
  --oracle $BARISTA_ORACLE \
  --price 51000 \
  --rpc-url http://localhost:8899

# 4. Check oracle state
percolator-keeper oracle show \
  --oracle $BARISTA_ORACLE \
  --rpc-url http://localhost:8899
```

### Scenario 2: Automated Oracle Crank

```bash
# 1. Start local validator
solana-test-validator

# 2. Initialize oracle
percolator-keeper oracle init \
  --instrument BTC/USD \
  --price 50000 \
  --rpc-url http://localhost:8899

# Save oracle address
export BARISTA_ORACLE=<ORACLE_ADDRESS>

# 3. Start oracle crank (runs in foreground)
percolator-keeper oracle crank \
  --oracle $BARISTA_ORACLE \
  --instrument BTC/USD \
  --rpc-url http://localhost:8899 \
  --interval 5 \
  --source coingecko

# The crank will fetch prices every 5 seconds and update the oracle
# Press Ctrl+C to stop
```

### Scenario 3: Background Crank Service

```bash
# 1. Start crank in background
nohup percolator-keeper oracle crank \
  --oracle $BARISTA_ORACLE \
  --instrument BTC/USD \
  --rpc-url http://localhost:8899 \
  --interval 5 \
  --source coingecko \
  > oracle-crank.log 2>&1 &

# 2. Save PID
echo $! > oracle-crank.pid

# 3. Monitor logs
tail -f oracle-crank.log

# 4. Stop crank
kill $(cat oracle-crank.pid)
```

---

## Oracle Data Structure

The custom oracle uses a 128-byte account structure:

```rust
#[repr(C)]
pub struct PriceOracle {
    pub magic: u64,           // "PRCLORCL" (8 bytes, offset 0)
    pub version: u8,          // Version = 0 (1 byte, offset 8)
    pub bump: u8,             // PDA bump (1 byte, offset 9)
    pub _padding: [u8; 6],    // Padding (6 bytes, offset 10)
    pub authority: Pubkey,    // Who can update (32 bytes, offset 16)
    pub instrument: Pubkey,   // Which instrument (32 bytes, offset 48)
    pub price: i64,           // Price in 1e6 scale (8 bytes, offset 80)
    pub timestamp: i64,       // Unix timestamp (8 bytes, offset 88)
    pub confidence: i64,      // Confidence ± (8 bytes, offset 96)
    pub _reserved: [u8; 24],  // Reserved (24 bytes, offset 104)
}
// Total: 128 bytes
```

**Price Scaling**: All prices use 1e6 scale
- $50,000 → 50_000_000_000
- $0.25 → 250_000

---

## Price Source Integration

The oracle crank supports three price sources:

### 1. CoinGecko (Default)

**Pros**:
- Free tier available
- Wide coverage of assets
- No API key required

**Cons**:
- Rate limited (50 calls/minute on free tier)
- Slower updates (~60 second cache)

**Supported Symbols**:
- BTC, ETH, SOL, USDC, USDT, and most major tokens

### 2. Binance

**Pros**:
- Real-time spot prices
- High update frequency
- No API key required for public endpoints

**Cons**:
- Only supports trading pairs on Binance
- Less coverage than CoinGecko

**Supported Symbols**:
- BTC/USDT, ETH/USDT, SOL/USDT, etc.

### 3. Coinbase

**Pros**:
- Institutional-grade pricing
- Good for USD pairs
- No API key required

**Cons**:
- Limited to Coinbase-listed assets
- US-focused pricing

**Supported Symbols**:
- BTC-USD, ETH-USD, SOL-USD, etc.

---

## Environment Variables

Configure oracle CLI behavior with environment variables:

```bash
# Oracle program ID (if different from default)
export BARISTA_ORACLE_PROGRAM=oracLEqeDFu8PPCKMn1djT5wEZyejxLJ8T4KbvdR9Ge

# Default oracle address (for quick commands)
export BARISTA_ORACLE=7xK8...9mNv

# Keypair path (defaults to ~/.config/solana/id.json)
export BARISTA_KEYPAIR=/path/to/keypair.json

# Network (defaults to mainnet-beta for most commands, localnet for oracle)
export BARISTA_NETWORK=localnet

# RPC URL (overrides network default)
export BARISTA_RPC_URL=http://localhost:8899
```

**Quick command with defaults**:

```bash
# Instead of this:
percolator-keeper oracle show --oracle 7xK8...9mNv --rpc-url http://localhost:8899

# You can do:
export BARISTA_ORACLE=7xK8...9mNv
export BARISTA_RPC_URL=http://localhost:8899
percolator-keeper oracle show --oracle $BARISTA_ORACLE --rpc-url $BARISTA_RPC_URL
```

---

## Testing Checklist

### Unit Tests (TODO)

- [ ] Oracle initialization with various prices
- [ ] Oracle updates with different authorities
- [ ] Price scaling (1e6) conversions
- [ ] Staleness detection

### Integration Tests (TODO)

- [ ] End-to-end oracle init → update → show
- [ ] Crank fetching from all 3 price sources
- [ ] Oracle reading in execute_cross_slab (future)
- [ ] Margin calculation with oracle prices (future)

### Manual Testing

- [x] Oracle init command
- [x] Oracle update command
- [x] Oracle show command
- [x] Oracle crank with CoinGecko
- [ ] Oracle crank with Binance
- [ ] Oracle crank with Coinbase

---

## Known Limitations & Future Work

### Current Limitations

1. **No Pyth/Switchboard Integration**: Only custom oracle supported
   - Production will require Pyth for mainnet
   - Devnet can use Pyth devnet feeds

2. **No Oracle Adapter Layer**: Hardcoded custom oracle format
   - Future: Add oracle adapter trait (see `ORACLE_INTEGRATION_PLAN.md`)

3. **No Cross-Slab Alignment**: Not enforced in execute_cross_slab yet
   - Future: Add validation that all slabs use aligned oracles

4. **No Margin Integration**: Oracle prices not used in IM/MM calculations
   - Future: Update execute_cross_slab to read oracle prices

5. **No Staleness Checks**: Router doesn't reject stale oracle prices
   - Future: Add max age validation (e.g., 60 seconds)

### Future Enhancements (See ORACLE_INTEGRATION_PLAN.md)

**Phase 2**: Add Pyth SDK integration for devnet
**Phase 3**: Implement cross-slab oracle alignment validation
**Phase 4**: Integrate oracle prices into margin calculations
**Phase 5**: Add mark-to-market PnL tracking
**Phase 6**: Implement funding rate mechanism

---

## File Structure

```
keeper/
├── src/
│   ├── oracle/
│   │   ├── mod.rs            # Oracle module definition
│   │   ├── commands.rs       # Init, update, show implementations
│   │   └── price_sources.rs  # CoinGecko, Binance, Coinbase integration
│   ├── cli.rs                # CLI argument parsing (clap)
│   ├── main.rs               # Main entry point with oracle routing
│   └── config.rs             # Keeper configuration
└── Cargo.toml                # Dependencies (reqwest, chrono, clap)

programs/
└── oracle/
    ├── src/
    │   ├── lib.rs            # Oracle program entry
    │   ├── state.rs          # PriceOracle structure (128 bytes)
    │   ├── instructions.rs   # Initialize & UpdatePrice
    │   └── entrypoint.rs     # BPF entrypoint
    └── Cargo.toml

thoughts/
├── ORACLE_INTEGRATION_PLAN.md           # Full production plan (6 phases)
├── ORACLE_LOCALNET_DEVNET_GUIDE.md      # Setup guide
└── ORACLE_CLI_IMPLEMENTATION_SUMMARY.md # This file
```

---

## Troubleshooting

### Issue: "Oracle account not found"

**Cause**: Oracle address is incorrect or account doesn't exist

**Solution**:
```bash
# Verify oracle exists
solana account <ORACLE_ADDRESS> --url http://localhost:8899

# If not found, re-initialize
barista oracle init --instrument BTC-PERP --price 50000
```

### Issue: "Invalid authority"

**Cause**: Trying to update oracle with wrong authority keypair

**Solution**:
```bash
# Use the same authority that initialized the oracle
barista oracle update \
  --oracle $BARISTA_ORACLE \
  --price 51000 \
  --authority /path/to/authority/keypair.json
```

### Issue: "CoinGecko API rate limit"

**Cause**: Free tier limit of 50 calls/minute exceeded

**Solution**:
```bash
# Use Binance or Coinbase instead
barista oracle crank \
  --oracle $BARISTA_ORACLE \
  --instrument BTC/USD \
  --source binance  # or coinbase

# Or increase interval
barista oracle crank \
  --oracle $BARISTA_ORACLE \
  --instrument BTC/USD \
  --interval 10000  # 10 seconds instead of 5
```

### Issue: "Price is stale" warning in oracle show

**Cause**: Oracle hasn't been updated recently

**Solution**:
```bash
# Manually update
percolator-keeper oracle update --oracle $BARISTA_ORACLE --price <current_price>

# Or start crank for automated updates
percolator-keeper oracle crank \
  --oracle $BARISTA_ORACLE \
  --instrument BTC/USD \
  --interval 5
```

### Issue: "Transaction failed" when updating

**Cause**: Insufficient SOL for transaction fees

**Solution**:
```bash
# Check balance
solana balance

# Airdrop SOL if on localnet/devnet
solana airdrop 1

# Or fund from another wallet
solana transfer <PAYER_ADDRESS> 1 --from /path/to/funder/keypair.json
```

---

## Next Steps

### Immediate (Now available)

1. ✅ Use custom oracle in localnet tests
2. ✅ Start oracle crank for automated price updates
3. ✅ View oracle state with `oracle show` command

### Short Term (Next sprint)

1. Add unit tests for oracle CLI commands
2. Update execute_cross_slab to read oracle prices
3. Integrate oracle prices into margin calculations
4. Add oracle alignment validation

### Long Term (Production readiness)

1. Implement Pyth adapter for devnet
2. Add Switchboard support
3. Implement cross-slab oracle alignment
4. Add mark-to-market PnL tracking
5. Implement funding rate mechanism

See `ORACLE_INTEGRATION_PLAN.md` for full roadmap.

---

## Resources

**Documentation**:
- [Oracle Integration Plan](./ORACLE_INTEGRATION_PLAN.md) - Full 6-phase production plan
- [Localnet/Devnet Guide](./ORACLE_LOCALNET_DEVNET_GUIDE.md) - Setup guide
- [V0 Design](../V0_DESIGN.md) - Overall architecture

**External APIs**:
- [CoinGecko API](https://www.coingecko.com/en/api/documentation)
- [Binance API](https://binance-docs.github.io/apidocs/spot/en/)
- [Coinbase API](https://docs.cloud.coinbase.com/sign-in-with-coinbase/docs/api-prices)

**Oracle Providers** (for future):
- [Pyth Network](https://pyth.network/)
- [Switchboard](https://switchboard.xyz/)

---

**Status**: ✅ Phase 1 Complete - Custom Oracle CLI Implemented

**Next Phase**: Integration with Router for margin calculations

**Questions?** See [ORACLE_INTEGRATION_PLAN.md](./ORACLE_INTEGRATION_PLAN.md) or [ORACLE_LOCALNET_DEVNET_GUIDE.md](./ORACLE_LOCALNET_DEVNET_GUIDE.md)
