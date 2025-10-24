# Barista CLI

Command-line interface for Barista DEX on Solana.

## Installation

```bash
npm install -g @barista-dex/cli
```

Or use directly with npx:

```bash
npx @barista-dex/cli --help
```

## Configuration

The CLI comes pre-configured with program addresses for devnet, mainnet-beta, and localnet. Configuration is handled through environment variables (similar to binance-cli).

### Environment Variables

Set these once in your shell profile (`~/.bashrc`, `~/.zshrc`, etc.):

```bash
# Network: mainnet-beta (default), devnet, or localnet
export BARISTA_NETWORK=mainnet-beta

# Custom RPC endpoint (optional)
export BARISTA_RPC_URL=https://my-custom-rpc.com

# Keypair path (optional, defaults to ~/.config/solana/id.json)
export BARISTA_KEYPAIR=/path/to/keypair.json
```

**Priority:** CLI flags > Environment variables > Defaults

### Network Selection

You can override environment variables with CLI flags:

```bash
# Use environment variable (if set) or default to mainnet
barista portfolio

# Override with CLI flag
barista portfolio --network devnet

# Use environment variable for network, override RPC
barista portfolio --url https://my-custom-rpc.com
```

### Quick Setup

For mainnet trading with default settings (no configuration needed):
```bash
# Uses mainnet-beta by default
barista portfolio
```

For devnet testing:
```bash
# Option 1: Set environment variable (persistent)
export BARISTA_NETWORK=devnet
barista portfolio

# Option 2: Use CLI flag (one-time)
barista portfolio --network devnet
```

## Commands

### Portfolio Management

#### View Portfolio
```bash
barista portfolio

# View another trader's portfolio
barista portfolio --address <trader-address>
```

#### Deposit Collateral
```bash
barista deposit --mint <token-mint> --amount <amount>

# Example: Deposit 100 USDC
barista deposit --mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v --amount 100000000
```

**Note:** Amounts are in base units (1 USDC = 1000000)

#### Withdraw Collateral
```bash
barista withdraw --mint <token-mint> --amount <amount>
```

### Market Data

#### Get Price
```bash
barista price --slab <market>
```

#### View Order Book
```bash
barista book --slab <market>

# Show 20 levels
barista book --slab <market> --levels 20
```

## Options

All commands support the following options:

- `-n, --network <network>` - Network to use: `mainnet-beta`, `devnet`, or `localnet` (default: `BARISTA_NETWORK` env var or `mainnet-beta`)
- `-u, --url <url>` - Custom RPC URL (default: `BARISTA_RPC_URL` env var or network default)
- `-k, --keypair <path>` - Path to keypair file (default: `BARISTA_KEYPAIR` env var or `~/.config/solana/id.json`)
- `-h, --help` - Display help for command

## Examples

### Complete Trading Workflow

```bash
# 1. Deposit USDC collateral (100 USDC)
barista deposit \
  --mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v \
  --amount 100000000

# 2. Check your portfolio
barista portfolio

# 3. View market prices
barista price --slab SLaBZ6Ps...

# 4. View order book depth
barista book --slab SLaBZ6Ps... --levels 10

# 5. Withdraw funds
barista withdraw --mint EPjFWdd5... --amount 50000000
```

### Example Output

**Portfolio:**
```
📊 Portfolio Summary

┌─────────────────────────┬──────────────────────────────┐
│ Metric                  │ Value                        │
├─────────────────────────┼──────────────────────────────┤
│ Owner                   │ 5Z6sRxvL...                  │
│ Equity                  │ 1000.000000                  │
│ Collateral Value        │ 1000.000000                  │
│ Maint Margin            │ 0.000000                     │
│ Unrealized PnL          │ 0.000000                     │
│ Health                  │ 100.000000                   │
│ Last Update             │ 1234567890                   │
└─────────────────────────┴──────────────────────────────┘
```

**Order Book:**
```
📖 Order Book (SLaBZ6Ps...)

┌────────────────────┬────────────────────┬─────┬────────────────────┬────────────────────┐
│ Bid Size           │ Bid Price          │     │ Ask Price          │ Ask Size           │
├────────────────────┼────────────────────┼─────┼────────────────────┼────────────────────┤
│ 10.500000          │ 50000.000000       │     │ 50010.000000       │ 8.250000           │
│ 5.250000           │ 49990.000000       │     │ 50020.000000       │ 12.000000          │
└────────────────────┴────────────────────┴─────┴────────────────────┴────────────────────┘

Spread: 10.000000 (0.02%)
Total Bid Depth: 15 levels
Total Ask Depth: 12 levels
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Link locally
npm link

# Test
barista --help
```

## Architecture

The CLI is built on top of the [`@barista-dex/sdk`](https://www.npmjs.com/package/@barista-dex/sdk) package, which handles all Solana interactions and instruction building.

```
CLI (@barista-dex/cli)
  └── SDK (@barista-dex/sdk)
        └── Solana Web3.js
```

## License

MIT
