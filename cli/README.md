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

- `-k, --keypair <path>` - Path to keypair file (default: `~/.config/solana/id.json`)
- `-u, --url <url>` - RPC URL (default: from config or `http://localhost:8899`)
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
