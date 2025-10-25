# Percolator Keeper

Infrastructure services for Barista DEX, including liquidation bot and oracle management.

## Overview

The keeper binary provides two main services:

1. **Liquidation Bot**: Monitors user positions and liquidates undercollateralized accounts
2. **Oracle Management**: Initialize, update, and crank custom oracle prices for testing

## Installation

Build the keeper binary:

```bash
cargo build --release --bin percolator-keeper
```

The binary will be available at `target/release/percolator-keeper`.

## Commands

### Liquidation Bot

Run the liquidation keeper service:

```bash
percolator-keeper liquidate --config keeper-config.toml
```

**Configuration File** (`keeper-config.toml`):

```toml
rpc_url = "https://api.devnet.solana.com"
ws_url = "wss://api.devnet.solana.com"
router_program = "RoutR1VdCpHqj89WEMJhb6TkGT9cPfr1rVjhM3e2YQr"
keypair_path = "~/.config/solana/id.json"
poll_interval_secs = 1
preliq_buffer = 10000000  # $10 buffer for pre-liquidation
max_liquidations_per_batch = 5
liquidation_threshold = 0  # Liquidate if health <= 0
```

### Oracle Management

The keeper provides oracle commands for managing custom oracles in localnet/devnet environments.

#### Initialize Oracle

Create a new custom oracle:

```bash
percolator-keeper oracle init \
  --instrument BTC-PERP \
  --price 50000 \
  --rpc-url http://localhost:8899
```

**Options**:
- `-i, --instrument <name>` - Instrument name (e.g., BTC-PERP, ETH/USD)
- `-p, --price <price>` - Initial price (e.g., 50000)
- `-r, --rpc-url <url>` - RPC URL (default: http://localhost:8899)
- `-k, --keypair <path>` - Path to payer keypair file
- `-a, --authority <path>` - Path to authority keypair (defaults to payer)
- `--oracle-program <pubkey>` - Oracle program ID (optional)

#### Update Oracle Price

Manually update an oracle price:

```bash
percolator-keeper oracle update \
  --oracle <ORACLE_ADDRESS> \
  --price 51000 \
  --rpc-url http://localhost:8899
```

**Options**:
- `-o, --oracle <address>` - Oracle account address
- `-p, --price <price>` - New price (e.g., 51000)
- `-c, --confidence <amount>` - Confidence interval (±amount, defaults to 0.1% of price)
- `-r, --rpc-url <url>` - RPC URL (default: http://localhost:8899)
- `-k, --keypair <path>` - Path to payer keypair file
- `-a, --authority <path>` - Path to authority keypair (defaults to payer)
- `--oracle-program <pubkey>` - Oracle program ID (optional)

#### Show Oracle Information

Display current oracle state:

```bash
percolator-keeper oracle show \
  --oracle <ORACLE_ADDRESS> \
  --rpc-url http://localhost:8899
```

**Options**:
- `-o, --oracle <address>` - Oracle account address
- `-r, --rpc-url <url>` - RPC URL (default: http://localhost:8899)

#### Start Oracle Crank

Run automated price updater (fetches from external APIs):

```bash
percolator-keeper oracle crank \
  --oracle <ORACLE_ADDRESS> \
  --instrument BTC/USD \
  --rpc-url http://localhost:8899 \
  --interval 5 \
  --source coingecko
```

**Options**:
- `-o, --oracle <address>` - Oracle account address
- `-i, --instrument <name>` - Instrument name (e.g., BTC-PERP, ETH/USD)
- `-r, --rpc-url <url>` - RPC URL (default: http://localhost:8899)
- `-k, --keypair <path>` - Path to payer keypair file
- `-a, --authority <path>` - Path to authority keypair (defaults to payer)
- `--oracle-program <pubkey>` - Oracle program ID (optional)
- `--interval <seconds>` - Update interval in seconds (default: 5)
- `-s, --source <source>` - Price source: coingecko, binance, or coinbase (default: coingecko)

**Price Sources**:
- **CoinGecko** - Free tier, wide coverage, ~60s cache (default)
- **Binance** - Real-time spot prices, high frequency
- **Coinbase** - Institutional-grade pricing

## Quick Start - Oracle Setup

```bash
# 1. Start local validator
solana-test-validator

# 2. Initialize oracle
percolator-keeper oracle init \
  --instrument BTC-PERP \
  --price 50000 \
  --rpc-url http://localhost:8899

# Save oracle address from output
export BARISTA_ORACLE=<ORACLE_ADDRESS>

# 3. Start automated price crank (runs in foreground)
percolator-keeper oracle crank \
  --oracle $BARISTA_ORACLE \
  --instrument BTC/USD \
  --rpc-url http://localhost:8899 \
  --interval 5 \
  --source coingecko

# Press Ctrl+C to stop
```

## Running in Production

For production deployment:

1. **Liquidation Bot**: Run as a systemd service with appropriate config
2. **Oracle Crank**: Use supervisor/systemd for automatic restart
3. **Monitoring**: Add logging and alerting for failures

### Example: Background Crank Service

```bash
# Start crank in background
nohup percolator-keeper oracle crank \
  --oracle $BARISTA_ORACLE \
  --instrument BTC/USD \
  --rpc-url http://localhost:8899 \
  --interval 5 \
  --source coingecko \
  > oracle-crank.log 2>&1 &

# Save PID
echo $! > oracle-crank.pid

# Monitor logs
tail -f oracle-crank.log

# Stop crank
kill $(cat oracle-crank.pid)
```

## Architecture

```
keeper/
├── src/
│   ├── oracle/
│   │   ├── mod.rs            # Oracle module definition
│   │   ├── commands.rs       # Init, update, show implementations
│   │   └── price_sources.rs  # External API integration
│   ├── liquidation/
│   │   └── keeper.rs         # Liquidation bot logic
│   ├── cli.rs                # CLI argument parsing
│   ├── config.rs             # Configuration management
│   └── main.rs               # Entry point
└── Cargo.toml
```

## Documentation

- [Oracle Integration Plan](../thoughts/ORACLE_INTEGRATION_PLAN.md) - Full 6-phase production roadmap
- [Oracle Localnet/Devnet Guide](../thoughts/ORACLE_LOCALNET_DEVNET_GUIDE.md) - Setup instructions
- [Oracle CLI Implementation Summary](../thoughts/ORACLE_CLI_IMPLEMENTATION_SUMMARY.md) - Complete usage guide

## Notes

- **Custom Oracle**: Test-only, not for production mainnet
- **Production Oracles**: Use Pyth Network or Switchboard for mainnet
- **Localnet/Devnet**: Custom oracle with automated crank is recommended
- **Staleness**: Check oracle timestamps - prices older than 60s may be stale

## Environment Variables

```bash
# Default keypair for transactions
export BARISTA_KEYPAIR=/path/to/keypair.json

# Oracle program ID (if different from default)
export BARISTA_ORACLE_PROGRAM=oracLEqeDFu8PPCKMn1djT5wEZyejxLJ8T4KbvdR9Ge

# Keeper config path (for liquidation bot)
export KEEPER_CONFIG=/path/to/keeper-config.toml
```

## Troubleshooting

### Oracle Commands

**"Oracle account not found"**
```bash
# Verify oracle exists
solana account <ORACLE_ADDRESS> --url http://localhost:8899

# Re-initialize if not found
percolator-keeper oracle init --instrument BTC-PERP --price 50000
```

**"Invalid authority"**
```bash
# Use correct authority keypair
percolator-keeper oracle update \
  --oracle $BARISTA_ORACLE \
  --price 51000 \
  --authority /path/to/authority/keypair.json
```

**"CoinGecko API rate limit"**
```bash
# Switch to Binance or Coinbase
percolator-keeper oracle crank \
  --oracle $BARISTA_ORACLE \
  --instrument BTC/USD \
  --source binance

# Or increase interval
percolator-keeper oracle crank \
  --oracle $BARISTA_ORACLE \
  --instrument BTC/USD \
  --interval 10  # 10 seconds instead of 5
```

### Liquidation Bot

See [keeper-config.toml](./keeper-config.toml) for configuration options.

## License

See root [LICENSE](../LICENSE) file.
