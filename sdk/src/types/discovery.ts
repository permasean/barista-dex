import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

/**
 * Slab information for discovery
 */
export interface SlabInfo {
  address: PublicKey;
  lpOwner: PublicKey;
  instrument: PublicKey;
  markPx: BN;
  takerFeeBps: BN;
  contractSize: BN;
  seqno: number;
}

/**
 * Instrument information (v0: returns 1 per slab, future: up to 32)
 */
export interface InstrumentInfo {
  index: number;          // 0 in v0, 0-31 in full architecture
  pubkey: PublicKey;      // Instrument identifier
  markPx: BN;             // Current mark price
  contractSize: BN;       // Contract size
  takerFeeBps: BN;        // Taker fee in basis points
}

/**
 * Quote level (price and size)
 */
export interface QuoteLevel {
  price: BN;
  size: BN;
}

/**
 * Best bid/ask prices from QuoteCache
 */
export interface BestPrices {
  bid: QuoteLevel | null;
  ask: QuoteLevel | null;
  spread: BN | null;
  spreadBps: BN | null;
}

/**
 * Quote cache structure (read directly from slab account)
 */
export interface QuoteCache {
  seqnoSnapshot: number;
  bids: QuoteLevel[];     // Best 4 levels
  asks: QuoteLevel[];     // Best 4 levels
}
