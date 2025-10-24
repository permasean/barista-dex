import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

/**
 * Router instruction discriminators
 */
export enum RouterInstruction {
  Initialize = 0,
  Deposit = 1,
  Withdraw = 2,
  InitializePortfolio = 3,
  ExecuteCrossSlab = 4,
  LiquidateUser = 5,
  BurnLpShares = 6,
  CancelLpOrders = 7,
}

/**
 * Portfolio account structure
 */
export interface Portfolio {
  owner: PublicKey;
  collateralValue: BN;
  maintMargin: BN;
  unrealizedPnl: BN;
  equity: BN;
  health: BN;
  lastUpdate: BN;
}

/**
 * Registry account structure
 */
export interface Registry {
  authority: PublicKey;
  numVaults: number;
  numPortfolios: number;
  vaults: PublicKey[];
}

/**
 * Vault account structure
 */
export interface Vault {
  mint: PublicKey;
  totalDeposits: BN;
  totalWithdrawals: BN;
  balance: BN;
}

/**
 * Slab split for cross-slab routing
 */
export interface SlabSplit {
  slabMarket: PublicKey;
  isBuy: boolean;
  size: BN;
  price: BN;
}

/**
 * Liquidation parameters
 */
export interface LiquidationParams {
  portfolio: PublicKey;
  oracles: PublicKey[];
  slabs: PublicKey[];
  isPreliq: boolean;
  currentTs: BN;
}

/**
 * LP shares burn parameters
 */
export interface BurnLpSharesParams {
  user: PublicKey;
  marketId: PublicKey;
  sharesToBurn: BN;
  currentSharePrice: BN;
  currentTs: BN;
  maxStalenessSeconds: BN;
}

/**
 * Cancel LP orders parameters
 */
export interface CancelLpOrdersParams {
  user: PublicKey;
  marketId: PublicKey;
  orderIds: BN[];
  freedQuote: BN;
  freedBase: BN;
}

/**
 * Health calculation result
 */
export interface HealthResult {
  equity: BN;
  maintMargin: BN;
  health: BN;
  isHealthy: boolean;
}
