# Leverage & Market Order Redesign

## Summary

Completely redesigned leverage mechanics and added market order support based on user feedback for more intuitive UX.

## Key Changes

### 1. Intuitive Leverage Model

**Old (unintuitive)**:
- `-q` = actual position size
- `--leverage` only changed margin requirement
- User had to manually calculate position sizes

**New (intuitive)**:
- `-q` = **margin/equity to commit**
- `--leverage` = **multiplier for actual position**
- Actual position = quantity × leverage

### 2. Market Orders

**Old**: Always required `--price` flag (limit orders only)

**New**:
- **No --price** = Market order (uses slab mark price)
- **With --price** = Limit order

## Examples

### Spot Trading (1x leverage, default)

```bash
# Market order - commit 100 units of margin
barista buy --slab <addr> -q 100
# → Fetches market price, opens 100-unit position

# Limit order - commit 100 units at specific price
barista buy --slab <addr> -q 100 -p 50000000
# → Opens 100-unit position at limit price 50000000
```

### Margin Trading (leverage > 1x)

```bash
# 5x leverage market order
barista buy --slab <addr> -q 100 -l 5x
# → Fetches market price (say 10 USDC)
# → Margin committed: 100 × 10 = 1000 USDC
# → Actual position: 1000 × 5 = 5000 USDC (500 contracts)

# 10x leverage limit order
barista buy --slab <addr> -q 50 -p 10000000 -l 10x
# → Margin committed: 50 × 10 = 500 USDC
# → Actual position: 500 × 10 = 5000 USDC (500 contracts)
```

## Detailed Mechanics

### Calculation Flow

1. **User Input**: quantity (margin to commit)
2. **Margin Committed**: `quantity × price`
3. **Position Size**: `margin_committed × leverage`
4. **Actual Quantity**: `quantity × leverage` (contracts to trade on-chain)

### Example Walkthrough

```bash
barista buy --slab SOL-PERP -q 50 -p 10 -l 5x
```

**Step-by-step**:
1. User inputs: `quantity = 50`, `price = 10`, `leverage = 5`
2. Margin committed: `50 × 10 = 500 USDC`
3. Position size: `500 × 5 = 2500 USDC`
4. Actual quantity: `50 × 5 = 250 contracts`
5. Check: Do I have ≥500 USDC equity? ✓
6. Execute: Buy 250 contracts at price 10

**Result**: Opened 2500 USDC position using 500 USDC margin (5x effective leverage)

## CLI Output

### Market Order Example

```
  Market price: 50000000

  Trade Summary:
    Order type: Market
    Mode: Margin (5x)
    Quantity input: 100 units
    Price: 50000000
    Margin committed: 5000000000 units
    → Actual position: 25000000000 units (500 contracts)
    Available equity: 6000000000 units

  ⚠️  Caution: Using 5x leverage increases risk

  Execute market order? (y/N): y

✓ Buy order executed successfully!

  Position opened: 500 contracts
  Margin used: 5000000000 units
  Effective leverage: 5x
```

### Limit Order Example (Spot)

```
  Trade Summary:
    Order type: Limit
    Mode: Spot (1x)
    Quantity input: 100 units
    Price: 50000000
    Margin committed: 5000000000 units
    → Actual position: 5000000000 units (100 contracts)
    Available equity: 6000000000 units

✓ Buy order executed successfully!

  Position opened: 100 contracts
  Margin used: 5000000000 units
  Effective leverage: 1x
```

### Insufficient Margin Error

```
✗ Insufficient equity for this trade

  Trade Details:
    Mode: Margin (5x)
    Quantity input: 200 units
    Price: 50000000
    Margin committed: 10000000000 units
    Actual position size: 50000000000 units
    Actual quantity traded: 1000 contracts
    Available equity: 6000000000 units

  Tip: Maximum quantity input: 120 units
       (This will open 600 contracts with 5x leverage)
```

## SDK Changes

### New Methods

#### `calculatePositionSize(marginCommitted: BN, leverage: number): BN`

Returns actual position size from margin and leverage.

```typescript
const margin = new BN(1000); // 1000 USDC
const leverage = 5;
const positionSize = client.calculatePositionSize(margin, leverage);
// → 5000 USDC
```

#### `calculateActualQuantity(quantityInput: BN, price: BN, leverage: number): BN`

Returns actual quantity to trade on-chain (leveraged).

```typescript
const input = new BN(100);
const price = new BN(10_000_000); // 10 USDC (1e6 scale)
const leverage = 5;
const actualQty = client.calculateActualQuantity(input, price, leverage);
// → 500 contracts
```

#### `validateLeveragedPosition()` - Updated Return Type

Now returns:
```typescript
{
  valid: boolean;
  availableEquity: BN;
  marginCommitted: BN;        // NEW: how much margin user is committing
  actualQuantity: BN;         // NEW: actual contracts to trade (leveraged)
  positionSize: BN;           // NEW: total position value
  leverage: number;
  mode: 'spot' | 'margin';
}
```

Old fields removed: `requiredMargin`, `notional`

#### `calculateMaxQuantityInput()` - Renamed

Old name: `calculateMaxQuantity()`
New name: `calculateMaxQuantityInput()`

Returns maximum **input** quantity (not leveraged), which user can enter.

#### `getMarketPrice(slabMarket: PublicKey, slabProgramId: PublicKey): Promise<BN>`

Fetches current mark price from slab for market orders.

```typescript
const price = await client.getMarketPrice(slabMarket, slabProgramId);
// → Returns BN with mark price (1e6 scale)
```

## Migration Guide

### For CLI Users

**Before** (old model):
```bash
# Had to calculate: "I want 5x leverage on 1000 USDC"
# → need to trade 5000 USDC worth → quantity = 500
barista buy --slab <addr> -q 500 -p 10000000 --leverage 5x
# Confusing: why is quantity 500 if I only have 1000 USDC?
```

**After** (new model):
```bash
# Natural: "I want to commit 100 units with 5x leverage"
barista buy --slab <addr> -q 100 -p 10000000 -l 5x
# Clear: quantity represents MY margin, leverage multiplies it
```

### For SDK Users

**Before**:
```typescript
// Had to pre-calculate leveraged quantity
const quantity = new BN(500); // Pre-multiplied by leverage
const price = new BN(10_000_000);
await client.buildBuyInstruction(user, slab, quantity, price, slabProgram);
```

**After**:
```typescript
// Validate first, then use actual quantity
const quantityInput = new BN(100);
const price = new BN(10_000_000);
const leverage = 5;

const validation = await client.validateLeveragedPosition(
  user,
  quantityInput,
  price,
  leverage
);

if (validation.valid) {
  await client.buildBuyInstruction(
    user,
    slab,
    validation.actualQuantity,  // SDK calculates this
    price,
    slabProgram
  );
}
```

## On-Chain Compatibility

The on-chain program is **unchanged**. It still:
- Enforces 10% IMR (10x max leverage)
- Checks `portfolio.equity >= portfolio.im`
- Doesn't know about "input quantity" vs "actual quantity"

The redesign is purely **client-side UX** - we're just changing how users think about and input their trades.

## Technical Details

### Leverage Formula

```
Given:
  - quantity_input (user input)
  - price (limit or market)
  - leverage (1-10)

Calculate:
  margin_committed = quantity_input × price / 1e6
  position_size = margin_committed × leverage
  actual_quantity = quantity_input × leverage

On-chain check:
  required_margin = position_size × 0.1 (for leverage > 1)
  OR
  required_margin = position_size (for leverage = 1, spot)

  valid = user_equity >= margin_committed
```

### Market Price Fetching

Mark price is stored in slab state at offset 176:
```
Layout: discriminator(8) + version(4) + seqno(4) + program_id(32) +
        lp_owner(32) + router_id(32) + instrument(32) +
        contract_size(8) + tick(8) + lot(8) + mark_px(8)
```

We parse `mark_px` as `i64` and return as `BN`.

## Benefits

1. **Intuitive**: quantity = margin committed (what user controls)
2. **Flexible**: Market vs limit orders
3. **Transparent**: Shows both margin and actual position clearly
4. **Consistent**: Same mental model as traditional exchanges
5. **Safe**: Clear warnings and confirmations for leverage/market orders

## Related Commits

- Initial leverage implementation: `b2049c1`
- Leverage redesign + market orders: `<next commit>`

## Files Modified

- [sdk/src/clients/RouterClient.ts](sdk/src/clients/RouterClient.ts#L253-L419)
- [cli/src/commands/trading/buy.ts](cli/src/commands/trading/buy.ts)
- [cli/src/commands/trading/sell.ts](cli/src/commands/trading/sell.ts)
- [cli/src/index.ts](cli/src/index.ts#L60-L82)
