# Leverage Trading Implementation

## Overview

Added optional leverage parameter to CLI and SDK for intuitive margin trading while maintaining spot trading as default.

## Design Philosophy

- **No --leverage flag = Spot trading (1x)** - Requires full collateral
- **With --leverage flag = Margin trading (2x-10x)** - Leveraged positions
- Keep quantity-based interface (like Binance)
- Client-side validation before on-chain execution
- Clear warnings and confirmations for margin trades

## Implementation Summary

### SDK Changes ([sdk/src/clients/RouterClient.ts](sdk/src/clients/RouterClient.ts))

Added three new public methods for leverage validation:

#### 1. `calculateRequiredMargin(notional: BN, leverage: number = 1): BN`

Calculates required margin for a position:
- **Spot (1x)**: Returns full notional value
- **Margin (>1x)**: Returns `notional * 0.1 / leverage` (10% IMR on-chain)

Examples:
- 1000 USDC notional @ 1x → 1000 USDC required
- 1000 USDC notional @ 5x → 20 USDC required
- 1000 USDC notional @ 10x → 10 USDC required

#### 2. `validateLeveragedPosition(user, quantity, price, leverage = 1)`

Pre-flight validation that checks:
- Portfolio exists
- Leverage is within 1x-10x range
- User has sufficient equity for required margin

Returns validation object:
```typescript
{
  valid: boolean;
  availableEquity: BN;
  requiredMargin: BN;
  notional: BN;
  leverage: number;
  mode: 'spot' | 'margin';
}
```

#### 3. `calculateMaxQuantity(user, price, leverage = 1)`

Calculates maximum tradeable quantity with available equity:
- **Spot (1x)**: `equity / price`
- **Margin (>1x)**: `equity * leverage / (0.1 * price)`

### CLI Changes

#### Updated Commands

**Buy** ([cli/src/commands/trading/buy.ts](cli/src/commands/trading/buy.ts)):
```bash
barista buy --slab <addr> -q 100 -p 50000          # Spot (1x)
barista buy --slab <addr> -q 100 -p 50000 -l 5x    # Margin (5x)
```

**Sell** ([cli/src/commands/trading/sell.ts](cli/src/commands/trading/sell.ts)):
```bash
barista sell --slab <addr> -q 100 -p 50000         # Spot (1x)
barista sell --slab <addr> -q 100 -p 50000 -l 10x  # Margin (10x)
```

#### New Features

1. **Leverage parsing**: Accepts "5x", "10x", "5", "10" formats
2. **Pre-flight validation**: Checks margin before sending transaction
3. **Position summary**: Shows mode, notional, required margin, available equity
4. **Risk warnings**:
   - ≥8x leverage: Red warning about liquidation risk
   - ≥5x leverage: Yellow caution message
5. **Confirmation prompt**: Required for all margin trades (leverage > 1x)
6. **Helpful errors**: Shows max quantity when insufficient margin

#### Example Output

**Spot trade (sufficient margin)**:
```
  Position Summary:
    Mode: Spot (1x)
    Quantity: 100 units
    Price: 50000000
    Notional: 5000000000 units
    Required margin: 5000000000 units
    Available equity: 10000000000 units

✓ Buy order executed successfully!
```

**Margin trade (5x leverage)**:
```
  Position Summary:
    Mode: Margin (5x)
    Quantity: 100 units
    Price: 50000000
    Notional: 5000000000 units
    Required margin: 100000000 units
    Available equity: 150000000 units

  ⚠️  Caution: Using 5x leverage increases risk

  Continue with margin trade? (y/N): y

✓ Buy order executed successfully!
```

**Insufficient margin error**:
```
✗ Insufficient margin for this position

  Position Details:
    Mode: Margin (5x)
    Notional: 5000000000 units
    Required margin: 100000000 units
    Available equity: 50000000 units

  Tip: Maximum quantity at 5x leverage: 50 units
```

## On-Chain Context

The router program has hardcoded 10% Initial Margin Ratio (IMR):
- Location: [programs/router/src/instructions/execute_cross_slab.rs:252](programs/router/src/instructions/execute_cross_slab.rs#L252)
- Formula: `(abs_exposure * avg_price * 10) / (100 * 1_000_000)`
- Max leverage: 10x (1 / 0.1)

Client-side validation prevents users from attempting trades that would fail on-chain margin checks.

## Testing

Both SDK and CLI compile successfully:
```bash
cd sdk && npm run build   # ✓ Success
cd cli && npm run build   # ✓ Success
```

## Migration Notes

**Backwards Compatible**: Existing commands work unchanged (default to 1x spot trading)

Before:
```bash
barista buy --slab <addr> -q 100 -p 50000
# ✓ Still works - treated as spot (1x)
```

After:
```bash
barista buy --slab <addr> -q 100 -p 50000
# ✓ Same behavior - spot (1x)

barista buy --slab <addr> -q 100 -p 50000 -l 5x
# ✓ New - margin (5x)
```

## Future Enhancements

1. **Helper command**: `barista max-buy --slab <addr> -p <price> -l 5x`
2. **Portfolio leverage display**: Show current effective leverage
3. **Auto-calculate quantity**: `barista buy --value 1000 -l 5x` (calculate quantity from value)
4. **Leverage limits per market**: Market-specific leverage caps

## Related Files

- [sdk/src/clients/RouterClient.ts](sdk/src/clients/RouterClient.ts#L253-L378) - Leverage helpers
- [cli/src/commands/trading/buy.ts](cli/src/commands/trading/buy.ts) - Buy with leverage
- [cli/src/commands/trading/sell.ts](cli/src/commands/trading/sell.ts) - Sell with leverage
- [cli/src/index.ts](cli/src/index.ts#L66-L82) - CLI option definitions
- [programs/router/src/instructions/execute_cross_slab.rs](programs/router/src/instructions/execute_cross_slab.rs#L250-L262) - On-chain IMR calculation
