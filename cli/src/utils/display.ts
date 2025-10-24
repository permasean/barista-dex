import BN from 'bn.js';
import chalk from 'chalk';

/**
 * Format a BN amount with decimals
 */
export function formatAmount(amount: BN, decimals: number = 6): string {
  const divisor = new BN(10).pow(new BN(decimals));
  const whole = amount.div(divisor);
  const frac = amount.mod(divisor);

  const fracStr = frac.toString().padStart(decimals, '0');
  return `${whole.toString()}.${fracStr}`;
}

/**
 * Format price (default 6 decimals)
 */
export function formatPrice(price: BN): string {
  return formatAmount(price, 6);
}

/**
 * Calculate and format spread percentage
 */
export function calculateSpread(bid: BN, ask: BN): string {
  if (bid.isZero()) return '0.00';

  const spread = ask.sub(bid);
  const percentage = spread.mul(new BN(10000)).div(bid).toNumber() / 100;
  return percentage.toFixed(2);
}

/**
 * Format Solana signature for display
 */
export function formatSignature(signature: string): string {
  return `${signature.slice(0, 8)}...${signature.slice(-8)}`;
}

/**
 * Format public key for display
 */
export function formatPublicKey(pubkey: string): string {
  return `${pubkey.slice(0, 8)}...${pubkey.slice(-8)}`;
}

/**
 * Get explorer URL for transaction
 */
export function getExplorerUrl(signature: string, network: string = 'devnet'): string {
  const cluster = network === 'mainnet-beta' ? '' : `?cluster=${network}`;
  return `https://explorer.solana.com/tx/${signature}${cluster}`;
}

/**
 * Display success message
 */
export function displaySuccess(message: string): void {
  console.log(chalk.green(`✅ ${message}`));
}

/**
 * Display error message
 */
export function displayError(message: string): void {
  console.error(chalk.red(`❌ ${message}`));
}

/**
 * Display info message
 */
export function displayInfo(message: string): void {
  console.log(chalk.blue(`ℹ ${message}`));
}

/**
 * Display warning message
 */
export function displayWarning(message: string): void {
  console.log(chalk.yellow(`⚠ ${message}`));
}
