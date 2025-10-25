import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { loadKeypair } from '../utils/wallet';
import { updateOracleCommand } from '../commands/oracle/update';

/**
 * Oracle crank configuration
 */
export interface OracleCrankConfig {
  oracleAddress: string;
  instrument: string;
  network: string;
  url?: string;
  keypairPath?: string;
  authorityPath?: string;
  updateIntervalMs: number;
  priceSource: 'coingecko' | 'binance' | 'coinbase';
}

/**
 * Fetch price from CoinGecko API
 */
async function fetchPriceFromCoinGecko(symbol: string): Promise<number> {
  // Map instrument names to CoinGecko IDs
  const symbolMap: Record<string, string> = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'SOL': 'solana',
    'USDC': 'usd-coin',
    'USDT': 'tether',
  };

  const baseSymbol = symbol.split('-')[0].split('/')[0].toUpperCase();
  const coinId = symbolMap[baseSymbol] || baseSymbol.toLowerCase();

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const price = data[coinId]?.usd;

    if (!price) {
      throw new Error(`Price not found for ${coinId}`);
    }

    return price;
  } catch (error) {
    throw new Error(`Failed to fetch from CoinGecko: ${error}`);
  }
}

/**
 * Fetch price from Binance API
 */
async function fetchPriceFromBinance(symbol: string): Promise<number> {
  const baseSymbol = symbol.split('-')[0].split('/')[0].toUpperCase();
  const tradingPair = `${baseSymbol}USDT`;

  const url = `https://api.binance.com/api/v3/ticker/price?symbol=${tradingPair}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const price = parseFloat(data.price);

    if (!price || isNaN(price)) {
      throw new Error(`Invalid price from Binance: ${data.price}`);
    }

    return price;
  } catch (error) {
    throw new Error(`Failed to fetch from Binance: ${error}`);
  }
}

/**
 * Fetch price from Coinbase API
 */
async function fetchPriceFromCoinbase(symbol: string): Promise<number> {
  const baseSymbol = symbol.split('-')[0].split('/')[0].toUpperCase();
  const tradingPair = `${baseSymbol}-USD`;

  const url = `https://api.coinbase.com/v2/prices/${tradingPair}/spot`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Coinbase API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const price = parseFloat(data.data.amount);

    if (!price || isNaN(price)) {
      throw new Error(`Invalid price from Coinbase: ${data.data.amount}`);
    }

    return price;
  } catch (error) {
    throw new Error(`Failed to fetch from Coinbase: ${error}`);
  }
}

/**
 * Fetch price from configured source
 */
async function fetchPrice(instrument: string, source: string): Promise<number> {
  switch (source) {
    case 'coingecko':
      return fetchPriceFromCoinGecko(instrument);
    case 'binance':
      return fetchPriceFromBinance(instrument);
    case 'coinbase':
      return fetchPriceFromCoinbase(instrument);
    default:
      throw new Error(`Unknown price source: ${source}`);
  }
}

/**
 * Run oracle crank update once
 */
async function runOracleUpdate(config: OracleCrankConfig): Promise<void> {
  try {
    // Fetch latest price
    const price = await fetchPrice(config.instrument, config.priceSource);
    console.log(`[${new Date().toISOString()}] Fetched ${config.instrument}: $${price.toLocaleString()}`);

    // Update oracle using the update command
    await updateOracleCommand({
      oracle: config.oracleAddress,
      price: price.toString(),
      network: config.network as any,
      url: config.url,
      keypair: config.keypairPath,
      authority: config.authorityPath,
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error updating oracle:`, error);
  }
}

/**
 * Start oracle crank service
 *
 * Continuously fetches prices from external API and updates the oracle
 */
export async function startOracleCrank(config: OracleCrankConfig): Promise<void> {
  console.log('═══════════════════════════════════════════════════');
  console.log('            ORACLE CRANK SERVICE                   ');
  console.log('═══════════════════════════════════════════════════');
  console.log();
  console.log(`🔧 Configuration:`);
  console.log(`  Oracle:      ${config.oracleAddress}`);
  console.log(`  Instrument:  ${config.instrument}`);
  console.log(`  Network:     ${config.network}`);
  console.log(`  Price Source: ${config.priceSource}`);
  console.log(`  Update Interval: ${config.updateIntervalMs / 1000}s`);
  console.log();
  console.log('🚀 Starting crank service...');
  console.log('   Press Ctrl+C to stop');
  console.log();

  // Run initial update
  await runOracleUpdate(config);

  // Schedule periodic updates
  setInterval(async () => {
    await runOracleUpdate(config);
  }, config.updateIntervalMs);

  // Keep process alive
  process.on('SIGINT', () => {
    console.log('\n\n⏹️  Oracle crank stopped');
    process.exit(0);
  });
}

/**
 * CLI command to start oracle crank
 */
export interface OracleCrankOptions {
  oracle: string;
  instrument: string;
  network?: string;
  url?: string;
  keypair?: string;
  authority?: string;
  interval?: string;
  source?: 'coingecko' | 'binance' | 'coinbase';
}

export async function oracleCrankCommand(options: OracleCrankOptions) {
  const config: OracleCrankConfig = {
    oracleAddress: options.oracle,
    instrument: options.instrument,
    network: options.network || 'localnet',
    url: options.url,
    keypairPath: options.keypair,
    authorityPath: options.authority,
    updateIntervalMs: options.interval ? parseInt(options.interval) : 5000, // Default 5 seconds
    priceSource: options.source || 'coingecko',
  };

  await startOracleCrank(config);
}
