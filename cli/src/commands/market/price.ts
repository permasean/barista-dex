import { Connection, PublicKey } from '@solana/web3.js';
import { SlabClient, Cluster } from '@barista-dex/sdk';
import { getConfig } from '../../utils/wallet';
import { displayError, formatPrice, calculateSpread } from '../../utils/display';
import chalk from 'chalk';
import ora from 'ora';
import BN from 'bn.js';

interface PriceOptions {
  slab: string;
  url?: string;
  network?: string;
}

export async function priceCommand(options: PriceOptions): Promise<void> {
  const spinner = ora('Loading configuration...').start();

  try {
    // Validate required options
    if (!options.slab) {
      spinner.fail();
      displayError('Missing required option: --slab <address>');
      process.exit(1);
    }

    // Load configuration (uses env vars if not provided)
    const cluster = options.network as Cluster | undefined;
    const config = getConfig(cluster, options.url);

    // Connect to Solana
    const connection = new Connection(config.rpcUrl, 'confirmed');

    spinner.text = 'Connecting to Solana...';

    // Create SlabClient
    const slabAddress = new PublicKey(options.slab);
    const client = new SlabClient(
      connection,
      new PublicKey(config.slabProgramId)
    );

    spinner.text = 'Fetching order book...';

    // Get order book
    const orderBook = await client.getOrderBook(slabAddress);

    if (orderBook.bids.length === 0 && orderBook.asks.length === 0) {
      spinner.warn('Order book is empty');
      console.log(chalk.yellow('\n⚠ No orders on this market\n'));
      return;
    }

    spinner.succeed('Market prices loaded');

    // Extract best bid/ask
    const bestBid = orderBook.bids[0];
    const bestAsk = orderBook.asks[0];

    // Display prices
    console.log(chalk.bold('\n💰 Market Prices\n'));

    if (bestBid) {
      console.log(`  ${chalk.green('Best Bid')}: ${formatPrice(bestBid.price)} (size: ${formatPrice(bestBid.size)})`);
    } else {
      console.log(`  ${chalk.gray('Best Bid')}: N/A`);
    }

    if (bestAsk) {
      console.log(`  ${chalk.red('Best Ask')}: ${formatPrice(bestAsk.price)} (size: ${formatPrice(bestAsk.size)})`);
    } else {
      console.log(`  ${chalk.gray('Best Ask')}: N/A`);
    }

    if (bestBid && bestAsk) {
      const spread = bestAsk.price.sub(bestBid.price);
      console.log(`  ${chalk.gray('Spread')}: ${formatPrice(spread)} (${calculateSpread(bestBid.price, bestAsk.price)}%)`);

      const midPrice = bestBid.price.add(bestAsk.price).div(new BN(2));
      console.log(`  ${chalk.blue('Mid Price')}: ${formatPrice(midPrice)}`);
    }

    console.log();
  } catch (error: any) {
    spinner.fail();
    displayError(`Failed to fetch price: ${error.message}`);
    process.exit(1);
  }
}
