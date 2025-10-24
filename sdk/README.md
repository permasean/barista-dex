# @barista-dex/sdk

TypeScript SDK for interacting with Barista DEX on Solana.

## Installation

```bash
npm install @barista-dex/sdk
```

## Quick Start

```typescript
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { RouterClient } from '@barista-dex/sdk';
import BN from 'bn.js';

// Setup connection
const connection = new Connection('https://api.devnet.solana.com');
const wallet = Keypair.generate(); // Or load from file

// Initialize Router client
const routerProgramId = new PublicKey('Your_Router_Program_ID');
const router = new RouterClient(connection, routerProgramId, wallet);

// Initialize portfolio
const initPortfolioIx = router.buildInitializePortfolioInstruction(wallet.publicKey);

// Deposit USDC
const usdcMint = new PublicKey('USDC_Mint_Address');
const userTokenAccount = new PublicKey('User_Token_Account');
const amount = new BN(1_000_000_000); // 1000 USDC (6 decimals)

const depositIx = router.buildDepositInstruction(
  usdcMint,
  amount,
  wallet.publicKey,
  userTokenAccount
);

// Get portfolio data
const portfolio = await router.getPortfolio(wallet.publicKey);
console.log('Equity:', portfolio.equity.toString());
console.log('Health:', portfolio.health.toString());
```

## Features

### RouterClient

The `RouterClient` provides methods for:

- **PDA Derivation**: Derive portfolio, vault, registry, and authority PDAs
- **Account Fetching**: Fetch portfolio, registry, and vault account data
- **Instruction Builders**: Build all 8 Router instructions
  - Initialize
  - Deposit
  - Withdraw
  - InitializePortfolio
  - ExecuteCrossSlab
  - LiquidateUser
  - BurnLpShares
  - CancelLpOrders

### SlabClient

The `SlabClient` provides methods for:

- **PDA Derivation**: Derive slab and fill receipt PDAs
- **Account Fetching**: Fetch slab state and fill receipt data
- **Instruction Builders**: Build Slab instructions
  - Initialize Slab
  - CommitFill (v0 atomic fills)

### Utilities

- **Serialization**: Helpers for serializing/deserializing Solana data
- **Formatting**: Format amounts, prices, health ratios, and more

## API Reference

### RouterClient

#### Constructor

```typescript
constructor(
  connection: Connection,
  programId: PublicKey,
  wallet?: Keypair
)
```

#### PDA Derivation

```typescript
derivePortfolioPDA(user: PublicKey): [PublicKey, number]
deriveVaultPDA(mint: PublicKey): [PublicKey, number]
deriveRegistryPDA(): [PublicKey, number]
deriveAuthorityPDA(): [PublicKey, number]
```

#### Account Fetching

```typescript
async getPortfolio(user: PublicKey): Promise<Portfolio | null>
async getRegistry(): Promise<Registry | null>
async getVault(mint: PublicKey): Promise<Vault | null>
```

#### Instruction Builders

```typescript
buildInitializeInstruction(payer: PublicKey): TransactionInstruction

buildDepositInstruction(
  mint: PublicKey,
  amount: BN,
  user: PublicKey,
  userTokenAccount: PublicKey
): TransactionInstruction

buildWithdrawInstruction(
  mint: PublicKey,
  amount: BN,
  user: PublicKey,
  userTokenAccount: PublicKey
): TransactionInstruction

buildInitializePortfolioInstruction(user: PublicKey): TransactionInstruction

buildExecuteCrossSlabInstruction(
  user: PublicKey,
  splits: SlabSplit[],
  slabProgram: PublicKey
): TransactionInstruction

buildLiquidateUserInstruction(params: LiquidationParams): TransactionInstruction

buildBurnLpSharesInstruction(params: BurnLpSharesParams): TransactionInstruction

buildCancelLpOrdersInstruction(params: CancelLpOrdersParams): TransactionInstruction
```

### SlabClient

#### Constructor

```typescript
constructor(
  connection: Connection,
  programId: PublicKey,
  wallet?: Keypair
)
```

#### PDA Derivation

```typescript
deriveSlabPDA(lpOwner: PublicKey, instrument: PublicKey): [PublicKey, number]
deriveFillReceiptPDA(slab: PublicKey, seqno: number): [PublicKey, number]
```

#### Account Fetching

```typescript
async getSlabState(slab: PublicKey): Promise<SlabState | null>
async getFillReceipt(slab: PublicKey, seqno: number): Promise<FillReceipt | null>
async getOrderBook(slab: PublicKey): Promise<OrderBook>
```

#### Instruction Builders

```typescript
buildInitializeSlabInstruction(
  lpOwner: PublicKey,
  routerId: PublicKey,
  instrument: PublicKey,
  markPx: BN,
  takerFeeBps: BN,
  contractSize: BN,
  payer: PublicKey
): TransactionInstruction

buildCommitFillInstruction(
  slab: PublicKey,
  expectedSeqno: number,
  side: OrderSide,
  qty: BN,
  limitPx: BN,
  routerSigner: PublicKey
): TransactionInstruction
```

## Examples

### Execute Cross-Slab Trade

```typescript
const splits: SlabSplit[] = [
  {
    slabMarket: new PublicKey('Slab_1'),
    isBuy: true,
    size: new BN(1_000_000), // 1.0 (6 decimals)
    price: new BN(50_000_000), // $50.00
  },
  {
    slabMarket: new PublicKey('Slab_2'),
    isBuy: true,
    size: new BN(500_000), // 0.5 (6 decimals)
    price: new BN(51_000_000), // $51.00
  },
];

const tradeIx = router.buildExecuteCrossSlabInstruction(
  wallet.publicKey,
  splits,
  slabProgramId
);
```

### Liquidate Undercollateralized User

```typescript
const liquidationParams: LiquidationParams = {
  portfolio: targetUserPortfolio,
  oracles: [oraclePubkey1, oraclePubkey2],
  slabs: [slabPubkey1, slabPubkey2],
  isPreliq: false,
  currentTs: new BN(Date.now() / 1000),
};

const liquidateIx = router.buildLiquidateUserInstruction(liquidationParams);
```

### Format Portfolio Data

```typescript
import { formatAmount, formatHealth, formatUsd } from '@barista-dex/sdk';

const portfolio = await router.getPortfolio(wallet.publicKey);

console.log('Collateral:', formatUsd(portfolio.collateralValue));
console.log('Equity:', formatUsd(portfolio.equity));
console.log('Health:', formatHealth(portfolio.health));
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Test
npm test

# Clean
npm run clean
```

## License

MIT
