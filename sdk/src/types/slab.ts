import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

/**
 * Slab instruction discriminators
 */
export enum SlabInstruction {
  Initialize = 0,
  CommitFill = 1,
}

/**
 * Order side
 */
export enum OrderSide {
  Bid = 0,
  Ask = 1,
}

/**
 * Order type
 */
export enum OrderType {
  Limit = 0,
  PostOnly = 1,
  ImmediateOrCancel = 2,
  FillOrKill = 3,
}

/**
 * Order book level
 */
export interface BookLevel {
  price: BN;
  size: BN;
  numOrders: number;
}

/**
 * Order book snapshot
 */
export interface OrderBook {
  bids: BookLevel[];
  asks: BookLevel[];
  lastUpdate: BN;
}

/**
 * Order placement parameters
 */
export interface PlaceOrderParams {
  user: PublicKey;
  side: OrderSide;
  orderType: OrderType;
  price: BN;
  size: BN;
  clientOrderId?: BN;
}

/**
 * Order cancellation parameters
 */
export interface CancelOrderParams {
  user: PublicKey;
  orderId: BN;
}

/**
 * Open order information
 */
export interface OpenOrder {
  orderId: BN;
  user: PublicKey;
  side: OrderSide;
  price: BN;
  size: BN;
  filled: BN;
  timestamp: BN;
}

/**
 * Trade information
 */
export interface Trade {
  maker: PublicKey;
  taker: PublicKey;
  price: BN;
  size: BN;
  timestamp: BN;
  isBuyerMaker: boolean;
}
