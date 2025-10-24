import { Connection, PublicKey } from '@solana/web3.js';
import { SlabClient, Cluster } from '@barista-dex/sdk';
import { getConfig } from '../../utils/wallet';
import { displayError, formatPrice } from '../../utils/display';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import BN from 'bn.js';

interface BookOptions {
  slab: string;
  levels?: string;
  url?: string;
  network?: string;
}

export async function bookCommand(options: BookOptions): Promise<void> {
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
    const numLevels = parseInt(options.levels || '10', 10);

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

    spinner.succeed('Order book loaded');

    // Display order book
    console.log(chalk.bold(`\n📖 Order Book (${options.slab.slice(0, 8)}...)\n`));

    // Create table
    const table = new Table({
      head: [
        chalk.green('Bid Size'),
        chalk.green('Bid Price'),
        '',
        chalk.red('Ask Price'),
        chalk.red('Ask Size'),
      ],
      colWidths: [20, 20, 5, 20, 20],
    });

    // Get the levels to display
    const bids = orderBook.bids.slice(0, numLevels);
    const asks = orderBook.asks.slice(0, numLevels).reverse(); // Reverse asks for display

    const maxRows = Math.max(bids.length, asks.length);

    for (let i = 0; i < maxRows; i++) {
      const askIndex = asks.length - 1 - i;
      const bidIndex = i;

      const ask = askIndex >= 0 ? asks[askIndex] : null;
      const bid = bidIndex < bids.length ? bids[bidIndex] : null;

      table.push([
        bid ? formatPrice(bid.size) : '',
        bid ? chalk.green(formatPrice(bid.price)) : '',
        '',
        ask ? chalk.red(formatPrice(ask.price)) : '',
        ask ? formatPrice(ask.size) : '',
      ]);
    }

    console.log(table.toString());

    // Display summary
    if (bids.length > 0 && asks.length > 0) {
      const bestBid = orderBook.bids[0];
      const bestAsk = orderBook.asks[0];
      const spread = bestAsk.price.sub(bestBid.price);
      const spreadBps = spread.mul(new BN(10000)).div(bestBid.price).toNumber();

      console.log(chalk.gray(`\nSpread: ${formatPrice(spread)} (${(spreadBps / 100).toFixed(2)}%)`));
      console.log(chalk.gray(`Total Bid Depth: ${bids.length} levels`));
      console.log(chalk.gray(`Total Ask Depth: ${asks.length} levels\n`));
    }
  } catch (error: any) {
    spinner.fail();
    displayError(`Failed to fetch order book: ${error.message}`);
    process.exit(1);
  }
}
