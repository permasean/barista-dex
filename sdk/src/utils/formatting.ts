import BN from 'bn.js';

/**
 * Format amount with decimals (e.g., 1000000 with 6 decimals -> "1.000000")
 */
export function formatAmount(amount: BN, decimals: number): string {
  const str = amount.toString().padStart(decimals + 1, '0');
  const integerPart = str.slice(0, -decimals) || '0';
  const decimalPart = str.slice(-decimals);
  return `${integerPart}.${decimalPart}`;
}

/**
 * Parse amount with decimals (e.g., "1.5" with 6 decimals -> 1500000)
 */
export function parseAmount(amountStr: string, decimals: number): BN {
  const [integerPart, decimalPart = ''] = amountStr.split('.');
  const paddedDecimal = decimalPart.padEnd(decimals, '0').slice(0, decimals);
  const combined = integerPart + paddedDecimal;
  return new BN(combined);
}

/**
 * Format health ratio as percentage (e.g., 1050000 -> "105.00%")
 */
export function formatHealth(health: BN): string {
  const healthNum = health.toNumber() / 1e6;
  return `${healthNum.toFixed(2)}%`;
}

/**
 * Format price with market decimals
 */
export function formatPrice(price: BN, quoteDecimals: number, baseDecimals: number): string {
  const priceDecimals = quoteDecimals - baseDecimals;
  return formatAmount(price, priceDecimals);
}

/**
 * Truncate public key for display (e.g., "AbC...XyZ")
 */
export function truncatePubkey(pubkey: string, length: number = 4): string {
  if (pubkey.length <= length * 2 + 3) {
    return pubkey;
  }
  return `${pubkey.slice(0, length)}...${pubkey.slice(-length)}`;
}

/**
 * Format timestamp to ISO string
 */
export function formatTimestamp(timestamp: BN): string {
  return new Date(timestamp.toNumber() * 1000).toISOString();
}

/**
 * Format USD value (6 decimals)
 */
export function formatUsd(value: BN): string {
  return `$${formatAmount(value, 6)}`;
}

/**
 * Calculate basis points (e.g., 0.05% -> 5 bps)
 */
export function toBasisPoints(value: number): number {
  return Math.round(value * 10000);
}

/**
 * Format basis points as percentage
 */
export function formatBasisPoints(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}
