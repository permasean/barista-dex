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

Before using the CLI, create a configuration file at `~/.barista/config.json`:

```json
{
  "routerProgramId": "RoutR1VdCpHqj89WEMJhb6TkGT9cPfr1rVjhM3e2YQr",
  "slabProgramId": "SLaBZ6PsDLh2X6HzEoqxFDMqCVcJXDKCNEYuPzUvGPk",
  "rpcUrl": "https://api.devnet.solana.com",
  "network": "devnet"
}
```

## Usage

### View Portfolio

View your portfolio holdings and positions:

```bash
barista portfolio

# View another user's portfolio
barista portfolio --address <user-pubkey>

# Specify custom RPC
barista portfolio --url https://api.mainnet-beta.solana.com
```

### Deposit Collateral

Deposit tokens into your Barista vault:

```bash
barista deposit \
  --mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v \
  --amount 1000000

# With custom keypair
barista deposit \
  --mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v \
  --amount 1000000 \
  --keypair ~/my-wallet.json
```

**Note:** Amount should be in base units (e.g., for USDC with 6 decimals, 1000000 = 1 USDC)

### View Market Price

Get the current best bid/ask from a slab order book:

```bash
barista price --slab <slab-address>

# Example
barista price --slab SLaBZ6PsDLh2X6HzEoqxFDMqCVcJXDKCNEYuPzUvGPk
```

## Options

All commands support the following options:

- `-k, --keypair <path>` - Path to keypair file (default: `~/.config/solana/id.json`)
- `-u, --url <url>` - RPC URL (default: from config or `http://localhost:8899`)
- `-h, --help` - Display help for command

## Examples

### Check portfolio balance

```bash
barista portfolio
```

Output:
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

### Deposit USDC

```bash
# Deposit 100 USDC (100 * 10^6 = 100000000)
barista deposit \
  --mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v \
  --amount 100000000
```

Output:
```
✅ Deposit successful!
  Signature: 2ZE7t...
  Explorer: https://explorer.solana.com/tx/2ZE7t...?cluster=devnet
```

### Check market prices

```bash
barista price --slab SLaBZ6PsDLh2X6HzEoqxFDMqCVcJXDKCNEYuPzUvGPk
```

Output:
```
💰 Market Prices

  Best Bid: 50000.000000 (size: 10.000000)
  Best Ask: 50010.000000 (size: 5.000000)
  Spread: 10.000000 (0.02%)
  Mid Price: 50005.000000
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
