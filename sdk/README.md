# @barista-dex/sdk

TypeScript SDK for interacting with Barista DEX on Solana, a fork of Percolator DEX by Toly

## Installation

```bash
npm install @barista-dex/sdk @solana/web3.js bn.js
```

## Quick Start

```typescript
import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';
import { RouterClient } from '@barista-dex/sdk';
import BN from 'bn.js';

// Setup connection and wallet
const connection = new Connection('https://api.devnet.solana.com');
const wallet = Keypair.fromSecretKey(/* your secret key */);

// Initialize Router client
const routerProgramId = new PublicKey('Your_Router_Program_ID');
const router = new RouterClient(connection, routerProgramId, wallet);

// Create and initialize portfolio
const initIx = router.buildInitializePortfolioInstruction(wallet.publicKey);
const tx = new Transaction().add(initIx);
const signature = await connection.sendTransaction(tx, [wallet]);
await connection.confirmTransaction(signature);

console.log('Portfolio initialized!');
```

## Core Concepts

### Router Program
The Router is the global coordinator that handles:
- **Collateral Management**: Unified vault system for all deposited assets
- **Portfolio Margin**: Cross-margin accounts with health-based risk management
- **Cross-Slab Routing**: Intelligent order routing across multiple LP markets
- **Liquidations**: Automated liquidation of undercollateralized positions

### Slab Program
Slabs are LP-run perpetual markets that:
- Run independent order books (v0: atomic fills only)
- Settle against mark price oracles
- Charge taker fees to traders
- Allow LPs to earn spread and fees

## Complete Usage Guide

### 1. Setup and Configuration

#### Network Configuration

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { RouterClient, SlabClient } from '@barista-dex/sdk';

// Devnet
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

// Localnet (for testing)
// const connection = new Connection('http://localhost:8899', 'confirmed');

// Mainnet-beta
// const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

// Load wallet from file
import fs from 'fs';
const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync('wallet.json', 'utf-8')));
const wallet = Keypair.fromSecretKey(secretKey);

// Initialize clients
const routerProgramId = new PublicKey('YourRouterProgramId');
const slabProgramId = new PublicKey('YourSlabProgramId');

const router = new RouterClient(connection, routerProgramId, wallet);
const slab = new SlabClient(connection, slabProgramId, wallet);
```

#### Program Initialization (One-time)

```typescript
import { Transaction, SystemProgram } from '@solana/web3.js';

// Initialize the Router program (creates Registry and Authority)
async function initializeRouter() {
  const ix = router.buildInitializeInstruction(wallet.publicKey);

  const tx = new Transaction().add(ix);
  const signature = await connection.sendTransaction(tx, [wallet]);
  await connection.confirmTransaction(signature);

  console.log('Router initialized:', signature);
}
```

### 2. Portfolio Management

#### Initialize User Portfolio

```typescript
async function createPortfolio() {
  const ix = router.buildInitializePortfolioInstruction(wallet.publicKey);

  const tx = new Transaction().add(ix);
  const signature = await connection.sendTransaction(tx, [wallet]);
  await connection.confirmTransaction(signature);

  console.log('Portfolio created:', signature);
}
```

#### Deposit Collateral

```typescript
import { getAssociatedTokenAddress } from '@solana/spl-token';

async function depositCollateral(mintAddress: string, amountUsd: number) {
  const mint = new PublicKey(mintAddress);

  // Get user's token account
  const userTokenAccount = await getAssociatedTokenAddress(mint, wallet.publicKey);

  // Convert USD to token amount (assuming 6 decimals)
  const amount = new BN(amountUsd * 1_000_000);

  const ix = router.buildDepositInstruction(
    mint,
    amount,
    wallet.publicKey,
    userTokenAccount
  );

  const tx = new Transaction().add(ix);
  const signature = await connection.sendTransaction(tx, [wallet]);
  await connection.confirmTransaction(signature);

  console.log(`Deposited ${amountUsd} USDC:`, signature);
}

// Example: Deposit 1000 USDC
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
await depositCollateral(USDC_MINT.toString(), 1000);
```

#### Withdraw Collateral

```typescript
async function withdrawCollateral(mintAddress: string, amountUsd: number) {
  const mint = new PublicKey(mintAddress);
  const userTokenAccount = await getAssociatedTokenAddress(mint, wallet.publicKey);
  const amount = new BN(amountUsd * 1_000_000);

  const ix = router.buildWithdrawInstruction(
    mint,
    amount,
    wallet.publicKey,
    userTokenAccount
  );

  const tx = new Transaction().add(ix);
  const signature = await connection.sendTransaction(tx, [wallet]);
  await connection.confirmTransaction(signature);

  console.log(`Withdrew ${amountUsd} USDC:`, signature);
}
```

#### Check Portfolio Health

```typescript
import { formatUsd, formatHealth } from '@barista-dex/sdk';

async function checkPortfolioHealth() {
  const portfolio = await router.getPortfolio(wallet.publicKey);

  if (!portfolio) {
    console.log('Portfolio not found');
    return;
  }

  console.log('Portfolio Status:');
  console.log('  Collateral Value:', formatUsd(portfolio.collateralValue));
  console.log('  Unrealized PnL:   ', portfolio.unrealizedPnl.toString());
  console.log('  Equity:           ', formatUsd(portfolio.equity));
  console.log('  Maint Margin:     ', formatUsd(portfolio.maintMargin));
  console.log('  Health Ratio:     ', formatHealth(portfolio.health));

  const healthNum = portfolio.health.toNumber() / 1e6;
  if (healthNum < 100) {
    console.log('⚠️  WARNING: Portfolio is undercollateralized!');
  } else if (healthNum < 110) {
    console.log('⚠️  CAUTION: Close to liquidation threshold');
  } else {
    console.log('✓ Portfolio is healthy');
  }

  return portfolio;
}
```

### 3. Trading

#### Execute Cross-Slab Trade

```typescript
import { SlabSplit } from '@barista-dex/sdk';

async function executeTrade(
  side: 'buy' | 'sell',
  totalSize: number,
  slabMarkets: PublicKey[]
) {
  // Split order across multiple slabs for best execution
  const sizePerSlab = totalSize / slabMarkets.length;

  const splits: SlabSplit[] = slabMarkets.map(market => ({
    slabMarket: market,
    isBuy: side === 'buy',
    size: new BN(sizePerSlab * 1_000_000), // 6 decimals
    price: new BN(50_000_000), // $50.00 limit price
  }));

  const ix = router.buildExecuteCrossSlabInstruction(
    wallet.publicKey,
    splits,
    slabProgramId
  );

  const tx = new Transaction().add(ix);
  const signature = await connection.sendTransaction(tx, [wallet]);
  await connection.confirmTransaction(signature);

  console.log(`Executed ${side} of ${totalSize}:`, signature);
}

// Example: Buy 10 ETH-PERP across 2 slabs
const slabs = [
  new PublicKey('Slab1Address'),
  new PublicKey('Slab2Address'),
];
await executeTrade('buy', 10, slabs);
```

#### Advanced Trading with Price Optimization

```typescript
async function smartTrade(
  side: 'buy' | 'sell',
  targetSize: number,
  maxSlippage: number = 0.01 // 1%
) {
  // Get best prices across all slabs
  const slabMarkets = await getAvailableSlabs(); // Your function to fetch slabs

  const slabPrices = await Promise.all(
    slabMarkets.map(async (slab) => {
      const state = await slabClient.getSlabState(slab);
      return { slab, markPx: state?.markPx || new BN(0) };
    })
  );

  // Sort by best price
  slabPrices.sort((a, b) => {
    if (side === 'buy') {
      return a.markPx.cmp(b.markPx); // Lowest first for buys
    } else {
      return b.markPx.cmp(a.markPx); // Highest first for sells
    }
  });

  // Build splits with slippage protection
  const splits: SlabSplit[] = slabPrices.slice(0, 3).map((item, idx) => {
    const slippageBps = maxSlippage * 10000 * (idx + 1);
    const slippageAdjustment = item.markPx.muln(slippageBps).divn(10000);

    const limitPrice = side === 'buy'
      ? item.markPx.add(slippageAdjustment)
      : item.markPx.sub(slippageAdjustment);

    return {
      slabMarket: item.slab,
      isBuy: side === 'buy',
      size: new BN((targetSize / 3) * 1_000_000),
      price: limitPrice,
    };
  });

  const ix = router.buildExecuteCrossSlabInstruction(
    wallet.publicKey,
    splits,
    slabProgramId
  );

  const tx = new Transaction().add(ix);
  const signature = await connection.sendTransaction(tx, [wallet]);
  await connection.confirmTransaction(signature);

  return signature;
}
```

### 4. Liquidations (Keeper Bots)

#### Monitor and Liquidate Undercollateralized Positions

```typescript
async function liquidationKeeper() {
  // Scan for unhealthy portfolios
  const registry = await router.getRegistry();
  if (!registry) return;

  for (let i = 0; i < registry.numPortfolios; i++) {
    // Get portfolio data (you'd need to track users)
    const user = getUserAtIndex(i); // Your indexing function
    const portfolio = await router.getPortfolio(user);

    if (!portfolio) continue;

    const health = portfolio.health.toNumber() / 1e6;

    if (health < 100) {
      console.log(`Found liquidation target: ${user.toString()}`);
      await liquidateUser(user);
    }
  }
}

async function liquidateUser(targetUser: PublicKey) {
  const [portfolioPDA] = router.derivePortfolioPDA(targetUser);

  // Get required oracle and slab accounts
  const oracles = [
    new PublicKey('OracleAddress1'),
    new PublicKey('OracleAddress2'),
  ];

  const slabs = [
    new PublicKey('SlabAddress1'),
    new PublicKey('SlabAddress2'),
  ];

  const params = {
    portfolio: portfolioPDA,
    oracles,
    slabs,
    isPreliq: false,
    currentTs: new BN(Math.floor(Date.now() / 1000)),
  };

  const ix = router.buildLiquidateUserInstruction(params);

  const tx = new Transaction().add(ix);
  const signature = await connection.sendTransaction(tx, [wallet]);
  await connection.confirmTransaction(signature);

  console.log('Liquidation executed:', signature);
}

// Run keeper continuously
setInterval(liquidationKeeper, 10000); // Check every 10 seconds
```

#### Pre-liquidation (Warning System)

```typescript
async function preliquidateUser(targetUser: PublicKey) {
  const [portfolioPDA] = router.derivePortfolioPDA(targetUser);

  const params = {
    portfolio: portfolioPDA,
    oracles: [],
    slabs: [],
    isPreliq: true, // Pre-liquidation flag
    currentTs: new BN(Math.floor(Date.now() / 1000)),
  };

  const ix = router.buildLiquidateUserInstruction(params);

  const tx = new Transaction().add(ix);
  const signature = await connection.sendTransaction(tx, [wallet]);

  console.log('Pre-liquidation warning sent:', signature);
}
```

### 5. LP Operations

#### Initialize a Slab Market (LP)

```typescript
async function createSlabMarket(instrumentPubkey: PublicKey) {
  const markPx = new BN(50_000_000); // $50.00 initial mark price
  const takerFeeBps = new BN(5_000); // 0.5% taker fee
  const contractSize = new BN(1_000_000); // 1.0 contract size

  const ix = slabClient.buildInitializeSlabInstruction(
    wallet.publicKey, // LP owner
    routerProgramId,
    instrumentPubkey,
    markPx,
    takerFeeBps,
    contractSize,
    wallet.publicKey // payer
  );

  const tx = new Transaction().add(ix);
  const signature = await connection.sendTransaction(tx, [wallet]);
  await connection.confirmTransaction(signature);

  // Derive slab address
  const [slabPDA] = slabClient.deriveSlabPDA(wallet.publicKey, instrumentPubkey);
  console.log('Slab created:', slabPDA.toString());

  return slabPDA;
}
```

#### Burn LP Shares

```typescript
async function burnLpShares(
  marketId: PublicKey,
  sharesToBurn: number,
  currentSharePrice: number
) {
  const params = {
    user: wallet.publicKey,
    marketId,
    sharesToBurn: new BN(sharesToBurn * 1_000_000),
    currentSharePrice: new BN(currentSharePrice * 1_000_000),
    currentTs: new BN(Math.floor(Date.now() / 1000)),
    maxStalenessSeconds: new BN(60), // 1 minute
  };

  const ix = router.buildBurnLpSharesInstruction(params);

  const tx = new Transaction().add(ix);
  const signature = await connection.sendTransaction(tx, [wallet]);
  await connection.confirmTransaction(signature);

  console.log('LP shares burned:', signature);
}
```

#### Cancel LP Orders

```typescript
async function cancelLpOrders(
  marketId: PublicKey,
  orderIds: number[]
) {
  if (orderIds.length > 16) {
    throw new Error('Can only cancel up to 16 orders at once');
  }

  const params = {
    user: wallet.publicKey,
    marketId,
    orderIds: orderIds.map(id => new BN(id)),
    freedQuote: new BN(0), // Updated by program
    freedBase: new BN(0),  // Updated by program
  };

  const ix = router.buildCancelLpOrdersInstruction(params);

  const tx = new Transaction().add(ix);
  const signature = await connection.sendTransaction(tx, [wallet]);
  await connection.confirmTransaction(signature);

  console.log(`Cancelled ${orderIds.length} orders:`, signature);
}
```

### 6. Market Data

#### Get Slab State

```typescript
async function getMarketInfo(slabAddress: PublicKey) {
  const state = await slabClient.getSlabState(slabAddress);

  if (!state) {
    console.log('Slab not found');
    return;
  }

  console.log('Market Information:');
  console.log('  LP Owner:       ', state.lpOwner.toString());
  console.log('  Instrument:     ', state.instrument.toString());
  console.log('  Mark Price:     ', state.markPx.toString());
  console.log('  Taker Fee (bps):', state.takerFeeBps.toString());
  console.log('  Contract Size:  ', state.contractSize.toString());
  console.log('  Sequence Number:', state.seqno);

  return state;
}
```

#### Get Fill Receipt

```typescript
async function getFillDetails(slabAddress: PublicKey, seqno: number) {
  const receipt = await slabClient.getFillReceipt(slabAddress, seqno);

  if (!receipt) {
    console.log('Fill not found');
    return;
  }

  console.log('Fill Details:');
  console.log('  Slab:      ', receipt.slab.toString());
  console.log('  Sequence:  ', receipt.seqno);
  console.log('  Side:      ', receipt.side === 0 ? 'BUY' : 'SELL');
  console.log('  Quantity:  ', receipt.qty.toString());
  console.log('  Fill Price:', receipt.fillPx.toString());
  console.log('  Timestamp: ', new Date(receipt.timestamp.toNumber() * 1000));

  return receipt;
}
```

### 7. Utility Functions

#### Format and Parse Amounts

```typescript
import { formatAmount, parseAmount, formatUsd } from '@barista-dex/sdk';

// Format token amounts
const amount = new BN(1_500_000); // 1.5 USDC (6 decimals)
console.log(formatAmount(amount, 6)); // "1.500000"
console.log(formatUsd(amount)); // "$1.500000"

// Parse user input
const userInput = "1.5";
const parsed = parseAmount(userInput, 6);
console.log(parsed.toString()); // "1500000"
```

#### Display Portfolio Summary

```typescript
import {
  formatUsd,
  formatHealth,
  formatTimestamp,
  truncatePubkey
} from '@barista-dex/sdk';

async function displayPortfolio(userAddress: PublicKey) {
  const portfolio = await router.getPortfolio(userAddress);

  if (!portfolio) {
    console.log('No portfolio found');
    return;
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('PORTFOLIO SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Owner:              ${truncatePubkey(portfolio.owner.toString())}`);
  console.log(`Collateral:         ${formatUsd(portfolio.collateralValue)}`);
  console.log(`Unrealized PnL:     ${portfolio.unrealizedPnl.toString()}`);
  console.log(`Equity:             ${formatUsd(portfolio.equity)}`);
  console.log(`Maintenance Margin: ${formatUsd(portfolio.maintMargin)}`);
  console.log(`Health Ratio:       ${formatHealth(portfolio.health)}`);
  console.log(`Last Update:        ${formatTimestamp(portfolio.lastUpdate)}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}
```

## Error Handling

```typescript
import { SendTransactionError } from '@solana/web3.js';

async function safeDeposit(mint: PublicKey, amount: BN) {
  try {
    const userTokenAccount = await getAssociatedTokenAddress(mint, wallet.publicKey);

    const ix = router.buildDepositInstruction(
      mint,
      amount,
      wallet.publicKey,
      userTokenAccount
    );

    const tx = new Transaction().add(ix);

    // Add recent blockhash and fee payer
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.feePayer = wallet.publicKey;

    const signature = await connection.sendTransaction(tx, [wallet], {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log('Deposit successful:', signature);
    return signature;

  } catch (error) {
    if (error instanceof SendTransactionError) {
      console.error('Transaction error:', error.message);
      console.error('Logs:', error.logs);
    } else {
      console.error('Unexpected error:', error);
    }
    throw error;
  }
}
```

## API Reference

### RouterClient

#### Constructor
```typescript
new RouterClient(connection: Connection, programId: PublicKey, wallet?: Keypair)
```

#### PDA Derivation
- `derivePortfolioPDA(user: PublicKey): [PublicKey, number]`
- `deriveVaultPDA(mint: PublicKey): [PublicKey, number]`
- `deriveRegistryPDA(): [PublicKey, number]`
- `deriveAuthorityPDA(): [PublicKey, number]`

#### Account Fetching
- `getPortfolio(user: PublicKey): Promise<Portfolio | null>`
- `getRegistry(): Promise<Registry | null>`
- `getVault(mint: PublicKey): Promise<Vault | null>`

#### Instruction Builders
- `buildInitializeInstruction(payer: PublicKey): TransactionInstruction`
- `buildDepositInstruction(mint, amount, user, userTokenAccount): TransactionInstruction`
- `buildWithdrawInstruction(mint, amount, user, userTokenAccount): TransactionInstruction`
- `buildInitializePortfolioInstruction(user: PublicKey): TransactionInstruction`
- `buildExecuteCrossSlabInstruction(user, splits, slabProgram): TransactionInstruction`
- `buildLiquidateUserInstruction(params: LiquidationParams): TransactionInstruction`
- `buildBurnLpSharesInstruction(params: BurnLpSharesParams): TransactionInstruction`
- `buildCancelLpOrdersInstruction(params: CancelLpOrdersParams): TransactionInstruction`

### SlabClient

#### Constructor
```typescript
new SlabClient(connection: Connection, programId: PublicKey, wallet?: Keypair)
```

#### PDA Derivation
- `deriveSlabPDA(lpOwner: PublicKey, instrument: PublicKey): [PublicKey, number]`
- `deriveFillReceiptPDA(slab: PublicKey, seqno: number): [PublicKey, number]`

#### Account Fetching
- `getSlabState(slab: PublicKey): Promise<SlabState | null>`
- `getFillReceipt(slab: PublicKey, seqno: number): Promise<FillReceipt | null>`
- `getOrderBook(slab: PublicKey): Promise<OrderBook>`

#### Instruction Builders
- `buildInitializeSlabInstruction(lpOwner, routerId, instrument, markPx, takerFeeBps, contractSize, payer): TransactionInstruction`
- `buildCommitFillInstruction(slab, expectedSeqno, side, qty, limitPx, routerSigner): TransactionInstruction`

## Types

### Portfolio
```typescript
interface Portfolio {
  owner: PublicKey;
  collateralValue: BN;
  maintMargin: BN;
  unrealizedPnl: BN;
  equity: BN;
  health: BN;
  lastUpdate: BN;
}
```

### SlabSplit
```typescript
interface SlabSplit {
  slabMarket: PublicKey;
  isBuy: boolean;
  size: BN;
  price: BN;
}
```

### LiquidationParams
```typescript
interface LiquidationParams {
  portfolio: PublicKey;
  oracles: PublicKey[];
  slabs: PublicKey[];
  isPreliq: boolean;
  currentTs: BN;
}
```

## Best Practices

1. **Always check portfolio health before trading**
   ```typescript
   const portfolio = await router.getPortfolio(wallet.publicKey);
   if (portfolio.health.toNumber() / 1e6 < 110) {
     console.warn('Low health - add collateral or reduce position');
   }
   ```

2. **Use transaction confirmation**
   ```typescript
   const signature = await connection.sendTransaction(tx, [wallet]);
   await connection.confirmTransaction(signature, 'confirmed');
   ```

3. **Handle errors gracefully**
   ```typescript
   try {
     await executeTrade();
   } catch (error) {
     console.error('Trade failed:', error);
     // Implement retry logic or alert user
   }
   ```

4. **Monitor for liquidations (keepers)**
   - Scan portfolios periodically
   - React quickly to unhealthy positions
   - Ensure sufficient gas for liquidation transactions

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test

# Clean build artifacts
npm run clean
```

## License

MIT
