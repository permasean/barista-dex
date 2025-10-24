/**
 * Barista DEX TypeScript SDK
 *
 * Client library for interacting with Barista DEX on Solana
 */

// Clients
export { RouterClient } from './clients/RouterClient';
export { SlabClient, SlabState, FillReceipt } from './clients/SlabClient';

// Types - Router
export {
  RouterInstruction,
  Portfolio,
  Registry,
  Vault,
  SlabSplit,
  LiquidationParams,
  BurnLpSharesParams,
  CancelLpOrdersParams,
  HealthResult,
} from './types/router';

// Types - Slab
export {
  SlabInstruction,
  OrderSide,
  OrderType,
  BookLevel,
  OrderBook,
  PlaceOrderParams,
  CancelOrderParams,
  OpenOrder,
  Trade,
} from './types/slab';

// Utils - Serialization
export {
  serializeU64,
  serializeU128,
  serializeI64,
  serializeBool,
  serializePubkey,
  deserializeU64,
  deserializeU128,
  deserializeI64,
  deserializeBool,
  deserializePubkey,
  createInstructionData,
} from './utils/serialization';

// Utils - Formatting
export {
  formatAmount,
  parseAmount,
  formatHealth,
  formatPrice,
  truncatePubkey,
  formatTimestamp,
  formatUsd,
  toBasisPoints,
  formatBasisPoints,
} from './utils/formatting';

// Constants
export {
  Cluster,
  RPC_ENDPOINTS,
  ROUTER_PROGRAM_IDS,
  SLAB_PROGRAM_IDS,
  getProgramIds,
  getRpcEndpoint,
} from './constants';
