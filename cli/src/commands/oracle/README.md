# Oracle CLI Commands

Custom oracle management for Barista DEX localnet/devnet testing.

## Quick Reference

```bash
# Initialize oracle
barista oracle init -i BTC-PERP -p 50000

# Update price
barista oracle update -o <ADDRESS> -p 51000

# Show oracle info
barista oracle show -o <ADDRESS>

# Start price crank (auto-updates)
barista oracle crank -o <ADDRESS> -i BTC/USD --interval 5000
```

## Commands

### init

Initialize a new custom oracle account.

**Usage:**
```bash
barista oracle init \
  --instrument <NAME> \
  --price <PRICE> \
  [--network localnet] \
  [--keypair <PATH>] \
  [--authority <PATH>]
```

**Example:**
```bash
barista oracle init \
  --instrument BTC-PERP \
  --price 50000 \
  --network localnet
```

### update

Manually update oracle price.

**Usage:**
```bash
barista oracle update \
  --oracle <ADDRESS> \
  --price <PRICE> \
  [--confidence <AMOUNT>] \
  [--network localnet]
```

**Example:**
```bash
barista oracle update \
  --oracle 7xK8...9mNv \
  --price 51000 \
  --network localnet
```

### show

Display oracle information (price, timestamp, confidence).

**Usage:**
```bash
barista oracle show \
  --oracle <ADDRESS> \
  [--network localnet]
```

**Example:**
```bash
barista oracle show \
  --oracle 7xK8...9mNv \
  --network localnet
```

### crank

Start automated oracle price updater (fetches from external APIs).

**Usage:**
```bash
barista oracle crank \
  --oracle <ADDRESS> \
  --instrument <NAME> \
  [--interval 5000] \
  [--source coingecko]
```

**Example:**
```bash
barista oracle crank \
  --oracle 7xK8...9mNv \
  --instrument BTC/USD \
  --interval 5000 \
  --source coingecko
```

**Price Sources:**
- `coingecko` - CoinGecko API (default, free)
- `binance` - Binance spot prices
- `coinbase` - Coinbase spot prices

## Environment Variables

```bash
# Oracle program ID (optional)
export BARISTA_ORACLE_PROGRAM=<PROGRAM_ID>

# Default oracle address (optional)
export BARISTA_ORACLE=<ORACLE_ADDRESS>

# Network (optional, defaults shown in each command)
export BARISTA_NETWORK=localnet

# RPC URL (optional)
export BARISTA_RPC_URL=http://localhost:8899
```

## Full Documentation

See [ORACLE_CLI_IMPLEMENTATION_SUMMARY.md](../../../../thoughts/ORACLE_CLI_IMPLEMENTATION_SUMMARY.md) for complete documentation.
