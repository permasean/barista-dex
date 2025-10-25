# Oracle Integration for Localnet/Devnet

**Target Environments**: Localnet (tests), Devnet (staging)
**Last Updated**: 2025-01-24

---

## Overview

For **localnet** (tests) and **devnet** (staging), we have 3 options for oracle integration:

1. **Custom Oracle** (Recommended for localnet/tests) - Already implemented
2. **Pyth Devnet Oracles** (Recommended for devnet) - Real Pyth feeds on devnet
3. **Mock Pyth Oracle** (Alternative for tests) - Simulates Pyth format without network dependency

---

## Option 1: Custom Oracle (Current Implementation)

### What We Have

✅ **Already Deployed**: `programs/oracle/` - Custom oracle program
✅ **Already Tested**: Integration tests at `tests/integration/tests/surfpool_bootstrap.rs:134-148`
✅ **Simple Interface**: Authority-controlled price updates

### Custom Oracle Structure

Located at: `programs/oracle/src/state.rs:15-45`

```rust
#[repr(C)]
pub struct PriceOracle {
    pub magic: u64,           // "PRCLORCL" (8 bytes)
    pub version: u8,          // Version = 0
    pub bump: u8,             // PDA bump
    pub _padding: [u8; 6],
    pub authority: Pubkey,    // Who can update (32 bytes)
    pub instrument: Pubkey,   // Which instrument (32 bytes)
    pub price: i64,           // At offset 72 (8 bytes, 1e6 scale)
    pub timestamp: i64,       // At offset 80 (8 bytes)
    pub confidence: i64,      // At offset 88 (8 bytes)
    pub _reserved: [u8; 24],
}
// Total: 128 bytes
```

### How to Use in Tests

**Step 1: Initialize Oracle**

```rust
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::Keypair,
};

// Create oracle account (128 bytes)
let oracle_account = Keypair::new();

// Build initialize instruction
// Data: discriminator (1) + initial_price (8) + bump (1) = 10 bytes
let initial_price = 50_000_000_000i64; // $50,000 in 1e6 scale
let bump = 255u8;

let mut init_data = vec![0u8]; // Discriminator = 0 (Initialize)
init_data.extend_from_slice(&initial_price.to_le_bytes());
init_data.push(bump);

let initialize_ix = Instruction::new_with_bytes(
    oracle_program_id,
    &init_data,
    vec![
        AccountMeta::new(oracle_account.pubkey(), false),
        AccountMeta::new_readonly(authority.pubkey(), true),
        AccountMeta::new_readonly(instrument_pubkey, false),
    ],
);

// Send transaction
let tx = Transaction::new_signed_with_payer(
    &[
        create_account_ix,  // System program create account
        initialize_ix,
    ],
    Some(&payer.pubkey()),
    &[&payer, &oracle_account, &authority],
    recent_blockhash,
);

banks_client.process_transaction(tx).await.unwrap();
```

**Step 2: Update Oracle Price**

```rust
// Build update_price instruction
// Data: discriminator (1) + price (8) + confidence (8) = 17 bytes
let new_price = 51_000_000_000i64; // $51,000
let confidence = 100_000i64;       // ±$100

let mut update_data = vec![1u8]; // Discriminator = 1 (UpdatePrice)
update_data.extend_from_slice(&new_price.to_le_bytes());
update_data.extend_from_slice(&confidence.to_le_bytes());

let update_ix = Instruction::new_with_bytes(
    oracle_program_id,
    &update_data,
    vec![
        AccountMeta::new(oracle_account.pubkey(), false),
        AccountMeta::new_readonly(authority.pubkey(), true),
    ],
);

let tx = Transaction::new_signed_with_payer(
    &[update_ix],
    Some(&payer.pubkey()),
    &[&payer, &authority],
    recent_blockhash,
);

banks_client.process_transaction(tx).await.unwrap();
```

**Step 3: Read Oracle Price (Same as Production)**

```rust
// Read oracle account data
let oracle_account_info = banks_client
    .get_account(oracle_account.pubkey())
    .await
    .unwrap()
    .unwrap();

let oracle_data = oracle_account_info.data;

// Extract price at offset 72
let price_bytes = [
    oracle_data[72], oracle_data[73], oracle_data[74], oracle_data[75],
    oracle_data[76], oracle_data[77], oracle_data[78], oracle_data[79],
];
let price = i64::from_le_bytes(price_bytes);

println!("Oracle price: {}", price); // 51_000_000_000
```

### Complete Test Example

Located at: `tests/integration/tests/surfpool_bootstrap.rs:134-148`

```rust
#[tokio::test]
async fn test_custom_oracle_integration() {
    let (mut program_test, slab_program_id, router_program_id, oracle_program_id) =
        create_program_test();

    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // 1. Create oracle account
    let oracle = Keypair::new();
    let authority = Keypair::new();
    let instrument = Pubkey::new_unique();

    let create_oracle_ix = system_instruction::create_account(
        &payer.pubkey(),
        &oracle.pubkey(),
        banks_client.get_rent().await.unwrap().minimum_balance(128),
        128,
        &oracle_program_id,
    );

    // 2. Initialize oracle with $50K price
    let initial_price = 50_000_000_000i64;
    let init_oracle_ix = build_initialize_oracle_instruction(
        oracle_program_id,
        oracle.pubkey(),
        authority.pubkey(),
        instrument,
        initial_price,
        255,
    );

    let tx = Transaction::new_signed_with_payer(
        &[create_oracle_ix, init_oracle_ix],
        Some(&payer.pubkey()),
        &[&payer, &oracle, &authority],
        recent_blockhash,
    );
    banks_client.process_transaction(tx).await.unwrap();

    // 3. Update price to $51K
    let new_price = 51_000_000_000i64;
    let update_oracle_ix = build_update_price_instruction(
        oracle_program_id,
        oracle.pubkey(),
        authority.pubkey(),
        new_price,
        100_000i64,
    );

    let tx = Transaction::new_signed_with_payer(
        &[update_oracle_ix],
        Some(&payer.pubkey()),
        &[&payer, &authority],
        recent_blockhash,
    );
    banks_client.process_transaction(tx).await.unwrap();

    // 4. Use oracle in execute_cross_slab
    let execute_ix = build_execute_cross_slab_instruction(
        router_program_id,
        portfolio.pubkey(),
        user.pubkey(),
        vault.pubkey(),
        registry.pubkey(),
        router_authority,
        vec![slab_account.pubkey()],
        vec![receipt_account.pubkey()],
        vec![oracle.pubkey()],  // Pass oracle account
        splits,
    );

    // Oracle will be read and validated in Router
    let tx = Transaction::new_signed_with_payer(
        &[execute_ix],
        Some(&payer.pubkey()),
        &[&payer, &user],
        recent_blockhash,
    );
    banks_client.process_transaction(tx).await.unwrap();
}
```

### Pros/Cons

**Pros**:
- ✅ Already implemented and tested
- ✅ No external dependencies
- ✅ Full control over price updates
- ✅ Deterministic for unit tests
- ✅ Fast (no network calls)

**Cons**:
- ❌ Manual price updates (need crank)
- ❌ Different format than production (Pyth/Switchboard)
- ❌ Tests don't validate production oracle integration

---

## Option 2: Pyth Devnet Oracles (Recommended for Devnet)

### What is Pyth Devnet?

Pyth provides **real price feeds on devnet** that update continuously (just like mainnet).

- **Program ID (Devnet)**: `gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s`
- **Price Feeds**: https://pyth.network/developers/price-feed-ids#solana-devnet
- **Update Frequency**: ~400ms (similar to mainnet)

### Available Devnet Feeds

| Symbol | Feed ID (Devnet) | Description |
|--------|------------------|-------------|
| BTC/USD | `0xf9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b` | Bitcoin spot |
| ETH/USD | `0xca80ba6dc32e08d06f1aa886011eed1d77c77be9eb761cc10d72b7d0a2fd57a6` | Ethereum spot |
| SOL/USD | `0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d` | Solana spot |

### How to Use Pyth in Devnet

**Step 1: Add Pyth SDK Dependency**

Add to `programs/router/Cargo.toml`:

```toml
[dependencies]
pyth-sdk-solana = "0.10"
```

**Step 2: Create Oracle Adapter (Phase 1 from main plan)**

```rust
// programs/router/src/oracle/pyth.rs
use pyth_sdk_solana::{load_price_feed_from_account_info, Price};

pub fn read_pyth_price(oracle_account: &AccountInfo) -> Result<i64, ProgramError> {
    let price_feed = load_price_feed_from_account_info(oracle_account)
        .map_err(|_| ProgramError::InvalidAccountData)?;

    let current_price = price_feed.get_current_price()
        .ok_or(ProgramError::InvalidAccountData)?;

    // Pyth price: price * 10^expo
    // Convert to 1e6 scale
    // Example: BTC price = 50000 * 10^-8 = 0.0005 → scale to 50_000_000_000
    let scaled_price = scale_pyth_price(current_price.price, current_price.expo);

    Ok(scaled_price)
}

fn scale_pyth_price(price: i64, expo: i32) -> i64 {
    const TARGET_SCALE: i32 = 6; // 1e6

    if expo >= 0 {
        price.saturating_mul(10_i64.pow(expo as u32)) / 1_000_000
    } else {
        let abs_expo = expo.abs();
        if abs_expo > TARGET_SCALE {
            price / 10_i64.pow((abs_expo - TARGET_SCALE) as u32)
        } else {
            price.saturating_mul(10_i64.pow((TARGET_SCALE - abs_expo) as u32))
        }
    }
}
```

**Step 3: Use in Tests**

```rust
use solana_sdk::pubkey;

// Pyth BTC/USD feed on devnet
const PYTH_BTC_USD_DEVNET: Pubkey = pubkey!("HovQMDrbAgAYPCmHVSrezcSmkMtXSSUsLDFANExrZh2J");

#[tokio::test]
async fn test_pyth_oracle_devnet() {
    let mut program_test = ProgramTest::default();

    // Add Pyth program to test environment
    program_test.add_program(
        "pyth_solana_receiver",
        pyth_sdk_solana::ID,
        None,
    );

    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // Note: In real devnet, Pyth account already exists and is updated by guardians
    // In tests, you need to create a mock Pyth account OR use actual devnet RPC

    // Option A: Use actual devnet (requires RPC endpoint)
    // let rpc_client = RpcClient::new("https://api.devnet.solana.com");
    // let pyth_account = rpc_client.get_account(&PYTH_BTC_USD_DEVNET).unwrap();

    // Option B: Create mock Pyth account in test (complex, need to construct Pyth format)
    // See next section for mock implementation

    // Execute cross-slab with Pyth oracle
    let execute_ix = build_execute_cross_slab_instruction(
        router_program_id,
        portfolio.pubkey(),
        user.pubkey(),
        vault.pubkey(),
        registry.pubkey(),
        router_authority,
        vec![slab_account.pubkey()],
        vec![receipt_account.pubkey()],
        vec![PYTH_BTC_USD_DEVNET],  // Use real Pyth feed
        splits,
    );

    let tx = Transaction::new_signed_with_payer(
        &[execute_ix],
        Some(&payer.pubkey()),
        &[&payer, &user],
        recent_blockhash,
    );
    banks_client.process_transaction(tx).await.unwrap();
}
```

**Step 4: Devnet Deployment**

```bash
# Deploy to devnet
solana config set --url https://api.devnet.solana.com

# Deploy programs
anchor build
anchor deploy --provider.cluster devnet

# Initialize router registry with Pyth oracle
barista-cli registry add-slab \
  --network devnet \
  --slab-id <SLAB_PUBKEY> \
  --oracle-id HovQMDrbAgAYPCmHVSrezcSmkMtXSSUsLDFANExrZh2J \
  --oracle-provider pyth

# Execute trade (oracle auto-read)
barista-cli trade \
  --network devnet \
  --side buy \
  --qty 1000000 \
  --instrument BTC-PERP
```

### Pros/Cons

**Pros**:
- ✅ Real Pyth feeds (production-like)
- ✅ Automatic price updates (no crank needed)
- ✅ Tests production oracle integration
- ✅ Same code for devnet → mainnet

**Cons**:
- ❌ Requires devnet connection (can't test offline)
- ❌ Prices can be volatile (non-deterministic tests)
- ❌ Network dependency (slower tests)

---

## Option 3: Mock Pyth Oracle (For Offline Tests)

### Create Mock Pyth Account

For **unit tests** that need Pyth format without network dependency:

```rust
// tests/utils/mock_pyth.rs
use pyth_sdk_solana::{Price, PriceFeed, PriceStatus};

/// Create a mock Pyth account with specified price
pub fn create_mock_pyth_account(
    banks_client: &mut BanksClient,
    payer: &Keypair,
    price: i64,
    expo: i32,
    confidence: u64,
) -> Pubkey {
    let pyth_account = Keypair::new();

    // Construct Pyth PriceFeed structure
    let price_feed = PriceFeed {
        id: [0u8; 32],
        price_account: pyth_account.pubkey(),
        price: Price {
            price,
            conf: confidence,
            expo,
            publish_time: Clock::get().unwrap().unix_timestamp,
            status: PriceStatus::Trading,
        },
        ema_price: Price {
            price,
            conf: confidence,
            expo,
            publish_time: Clock::get().unwrap().unix_timestamp,
            status: PriceStatus::Trading,
        },
    };

    // Serialize to account data
    let mut data = vec![0u8; std::mem::size_of::<PriceFeed>()];
    data[0..std::mem::size_of::<PriceFeed>()].copy_from_slice(
        unsafe { &*(&price_feed as *const PriceFeed as *const [u8; std::mem::size_of::<PriceFeed>()]) }
    );

    // Create account
    let create_account_ix = system_instruction::create_account(
        &payer.pubkey(),
        &pyth_account.pubkey(),
        banks_client.get_rent().await.unwrap().minimum_balance(data.len()),
        data.len() as u64,
        &pyth_sdk_solana::ID,
    );

    let tx = Transaction::new_signed_with_payer(
        &[create_account_ix],
        Some(&payer.pubkey()),
        &[&payer, &pyth_account],
        recent_blockhash,
    );
    banks_client.process_transaction(tx).await.unwrap();

    // Write data
    let account = banks_client.get_account(pyth_account.pubkey()).await.unwrap().unwrap();
    account.data = data;

    pyth_account.pubkey()
}
```

**Usage in tests**:

```rust
#[tokio::test]
async fn test_mock_pyth_oracle() {
    let (program_test, slab_program_id, router_program_id, _) = create_program_test();
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // Create mock Pyth oracle with BTC price = $50K
    let pyth_oracle = create_mock_pyth_account(
        &mut banks_client,
        &payer,
        50_000_000_000_00i64,  // $50,000 with expo -8
        -8,
        1_000_000_00,          // ±$1,000 confidence
    );

    // Use in trade
    let execute_ix = build_execute_cross_slab_instruction(
        router_program_id,
        portfolio.pubkey(),
        user.pubkey(),
        vault.pubkey(),
        registry.pubkey(),
        router_authority,
        vec![slab_account.pubkey()],
        vec![receipt_account.pubkey()],
        vec![pyth_oracle],  // Mock Pyth oracle
        splits,
    );

    let tx = Transaction::new_signed_with_payer(
        &[execute_ix],
        Some(&payer.pubkey()),
        &[&payer, &user],
        recent_blockhash,
    );
    banks_client.process_transaction(tx).await.unwrap();
}
```

### Pros/Cons

**Pros**:
- ✅ Tests Pyth format integration
- ✅ Deterministic prices (controlled)
- ✅ No network dependency (fast tests)
- ✅ Can simulate edge cases (stale, high confidence, etc.)

**Cons**:
- ❌ Complex to construct Pyth format correctly
- ❌ Format may change with Pyth SDK updates
- ❌ Requires understanding Pyth internals

---

## Recommended Strategy

### For Localnet (Unit Tests)

**Use Custom Oracle** (Option 1)

```rust
// tests/unit/oracle_tests.rs
#[test]
fn test_margin_calculation_with_oracle() {
    let oracle = setup_custom_oracle(50_000_000_000); // $50K

    let im = calculate_im_with_oracle(
        position_qty,
        contract_size,
        oracle,
        registry,
    );

    assert_eq!(im, expected_im);
}
```

**Rationale**:
- Fast, deterministic tests
- Full control over price movements
- No external dependencies

### For Devnet (Integration Tests)

**Use Real Pyth Devnet Feeds** (Option 2)

```bash
# Deploy to devnet
anchor deploy --provider.cluster devnet

# Configure with Pyth feeds
barista-cli registry add-slab \
  --network devnet \
  --oracle-id HovQMDrbAgAYPCmHVSrezcSmkMtXSSUsLDFANExrZh2J \
  --oracle-provider pyth
```

**Rationale**:
- Production-like environment
- Tests real Pyth integration
- Automatic price updates

### For CI/CD

**Hybrid Approach**:

1. **PR Tests** (fast, deterministic): Custom oracle
2. **Nightly Tests** (comprehensive): Mock Pyth + Custom
3. **Pre-Deploy Tests** (staging): Real Pyth on devnet

```yaml
# .github/workflows/test.yml
jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - run: cargo test --lib  # Uses custom oracle

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - run: cargo test --test integration  # Uses mock Pyth

  devnet-tests:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/master'
    steps:
      - run: cargo test --test e2e -- --network devnet  # Uses real Pyth
```

---

## Implementation Checklist

### Phase 0: Current State (Custom Oracle)

- [x] Custom oracle program deployed
- [x] Initialize instruction implemented
- [x] Update price instruction implemented
- [x] Integration tests use custom oracle
- [ ] CLI supports oracle initialization
- [ ] CLI supports price updates

### Phase 1: Add Custom Oracle CLI Support

**File**: `cli/src/commands/oracle.ts` (NEW)

```typescript
export async function initializeOracle(
  connection: Connection,
  payer: Keypair,
  oracleProgramId: PublicKey,
  authority: Keypair,
  instrument: PublicKey,
  initialPrice: number
): Promise<PublicKey> {
  const oracle = Keypair.generate();

  // Build initialize instruction
  const data = Buffer.alloc(10);
  data.writeUInt8(0, 0);  // Discriminator
  data.writeBigInt64LE(BigInt(initialPrice), 1);
  data.writeUInt8(255, 9);  // Bump

  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: oracle.publicKey, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
      { pubkey: instrument, isSigner: false, isWritable: false },
    ],
    programId: oracleProgramId,
    data,
  });

  const tx = new Transaction().add(instruction);
  await sendAndConfirmTransaction(connection, tx, [payer, oracle, authority]);

  console.log(`Oracle initialized: ${oracle.publicKey.toBase58()}`);
  return oracle.publicKey;
}

export async function updateOraclePrice(
  connection: Connection,
  payer: Keypair,
  oracleProgramId: PublicKey,
  oracleAddress: PublicKey,
  authority: Keypair,
  newPrice: number,
  confidence: number
): Promise<void> {
  // Build update instruction
  const data = Buffer.alloc(17);
  data.writeUInt8(1, 0);  // Discriminator
  data.writeBigInt64LE(BigInt(newPrice), 1);
  data.writeBigInt64LE(BigInt(confidence), 9);

  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: oracleAddress, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
    ],
    programId: oracleProgramId,
    data,
  });

  const tx = new Transaction().add(instruction);
  await sendAndConfirmTransaction(connection, tx, [payer, authority]);

  console.log(`Oracle price updated: ${newPrice}`);
}
```

**CLI Command**:

```bash
# Initialize oracle for BTC-PERP
barista-cli oracle init \
  --network localnet \
  --instrument BTC-PERP \
  --initial-price 50000 \
  --authority ~/.config/solana/id.json

# Update price
barista-cli oracle update \
  --network localnet \
  --oracle <ORACLE_PUBKEY> \
  --price 51000 \
  --confidence 100 \
  --authority ~/.config/solana/id.json
```

### Phase 2: Add Pyth Support for Devnet

**File**: `cli/src/config/oracles.ts` (NEW)

```typescript
export const PYTH_FEEDS = {
  devnet: {
    'BTC/USD': 'HovQMDrbAgAYPCmHVSrezcSmkMtXSSUsLDFANExrZh2J',
    'ETH/USD': 'EdVCmQ9FSPcVe5YySXDPCRmc8aDQLKJ9xvYBMZPie1Vw',
    'SOL/USD': 'J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix',
  },
  mainnet: {
    'BTC/USD': 'GVXRSBjFk6e6J3NbVPXohDJetcTjaeeuykUpbQF8UoMU',
    'ETH/USD': 'JBu1AL4obBcCMqKBBxhpWCNUt136ijcuMZLFvTP7iWdB',
    'SOL/USD': 'H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG',
  },
};

export function getOracleAddress(
  network: NetworkName,
  instrument: string
): PublicKey | null {
  if (network === 'localnet') {
    // Return custom oracle (need to query from registry or config)
    return null;  // Requires separate initialization
  }

  const feeds = PYTH_FEEDS[network];
  if (!feeds) return null;

  const address = feeds[instrument];
  return address ? new PublicKey(address) : null;
}
```

**CLI Integration**:

```bash
# For devnet, automatically use Pyth
barista-cli trade \
  --network devnet \
  --instrument BTC/USD \
  --side buy \
  --qty 1000000

# CLI auto-detects Pyth feed: HovQMDrbAgAYPCmHVSrezcSmkMtXSSUsLDFANExrZh2J
```

### Phase 3: Add Oracle Crank (For Custom Oracle)

**File**: `cli/src/crank/oracle-updater.ts` (NEW)

```typescript
/**
 * Oracle price updater crank for custom oracle in localnet/devnet
 *
 * Fetches prices from external API (e.g., CoinGecko) and updates custom oracle
 */
export async function runOracleCrank(
  connection: Connection,
  oracleProgramId: PublicKey,
  config: OracleCrankConfig
) {
  console.log('[Oracle Crank] Starting...');

  setInterval(async () => {
    try {
      // Fetch latest price from external API
      const price = await fetchPriceFromAPI(config.instrument);

      console.log(`[Oracle Crank] Fetched ${config.instrument}: $${price}`);

      // Update oracle
      await updateOraclePrice(
        connection,
        config.payer,
        oracleProgramId,
        config.oracleAddress,
        config.authority,
        Math.floor(price * 1_000_000),  // Convert to 1e6 scale
        Math.floor(price * 0.001 * 1_000_000)  // ±0.1% confidence
      );

      console.log(`[Oracle Crank] Updated oracle`);
    } catch (error) {
      console.error('[Oracle Crank] Error:', error);
    }
  }, config.updateIntervalMs);
}

async function fetchPriceFromAPI(instrument: string): Promise<number> {
  // Example: CoinGecko API
  const symbol = instrument.split('/')[0].toLowerCase();
  const response = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${symbol}&vs_currencies=usd`
  );
  const data = await response.json();
  return data[symbol].usd;
}
```

**Usage**:

```bash
# Start oracle crank for localnet
barista-cli crank oracle \
  --network localnet \
  --oracle <ORACLE_PUBKEY> \
  --instrument BTC/USD \
  --update-interval 5000  # 5 seconds
```

---

## Testing Strategy

### Unit Tests (Localnet)

**Custom Oracle Only**:

```rust
#[test]
fn test_execute_cross_slab_with_custom_oracle() {
    let mut ctx = setup_test_context();

    // Initialize custom oracle
    let oracle = create_custom_oracle(&mut ctx, 50_000_000_000);

    // Execute trade
    execute_cross_slab_with_oracle(&mut ctx, oracle);

    // Verify margin calculated with oracle price
    assert_margin_correct(&ctx, 50_000_000_000);
}
```

### Integration Tests (Devnet)

**Real Pyth Feeds**:

```rust
#[tokio::test]
#[ignore]  // Only run with --ignored flag
async fn test_devnet_pyth_integration() {
    let rpc_url = "https://api.devnet.solana.com";
    let client = RpcClient::new(rpc_url.to_string());

    // Use real Pyth BTC/USD feed on devnet
    let pyth_btc = pubkey!("HovQMDrbAgAYPCmHVSrezcSmkMtXSSUsLDFANExrZh2J");

    // Execute trade
    let signature = execute_trade_on_devnet(
        &client,
        pyth_btc,
        1_000_000,  // 1.0 BTC
    ).await.unwrap();

    println!("Trade executed on devnet: {}", signature);
}
```

---

## Quick Start Guide

### Scenario 1: Pure Localnet Testing (No Network)

```bash
# 1. Start local validator
solana-test-validator

# 2. Deploy programs
anchor build
anchor deploy

# 3. Initialize custom oracle
barista-cli oracle init \
  --network localnet \
  --instrument BTC-PERP \
  --initial-price 50000

# 4. Start oracle crank (updates price every 5s)
barista-cli crank oracle \
  --network localnet \
  --oracle <ORACLE_PUBKEY> \
  --instrument BTC/USD \
  --update-interval 5000 &

# 5. Execute trades
barista-cli trade \
  --network localnet \
  --instrument BTC-PERP \
  --side buy \
  --qty 1000000
```

### Scenario 2: Devnet with Real Pyth Feeds

```bash
# 1. Deploy to devnet
anchor deploy --provider.cluster devnet

# 2. Initialize router with Pyth oracle
barista-cli registry add-slab \
  --network devnet \
  --slab-id <SLAB_PUBKEY> \
  --oracle-id HovQMDrbAgAYPCmHVSrezcSmkMtXSSUsLDFANExrZh2J \
  --oracle-provider pyth

# 3. Execute trades (oracle auto-read from Pyth)
barista-cli trade \
  --network devnet \
  --instrument BTC/USD \
  --side buy \
  --qty 1000000

# No oracle crank needed - Pyth updates automatically!
```

---

## Summary

| Environment | Recommended Oracle | Setup Complexity | Auto-Updates | Deterministic |
|-------------|-------------------|------------------|--------------|---------------|
| **Unit Tests** | Custom Oracle | Low | No (need crank) | Yes |
| **Integration Tests** | Mock Pyth | Medium | No | Yes |
| **Devnet** | Real Pyth | Low | Yes | No |
| **Mainnet** | Real Pyth | Low | Yes | No |

**Next Steps**:

1. ✅ Custom oracle already works - use for current tests
2. 🔨 Add CLI commands for oracle init/update (Phase 1)
3. 🔨 Add oracle crank for automated updates (Phase 3)
4. 🔨 Add Pyth SDK integration (Phase 2) for devnet
5. 📝 Update test suite to use oracles in margin calculations

When ready for production integration, follow the main plan at `thoughts/ORACLE_INTEGRATION_PLAN.md`.
