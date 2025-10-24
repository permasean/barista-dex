import { Connection, PublicKey } from '@solana/web3.js';
import { SlabClient, formatAmount } from '@barista-dex/sdk';
import { getNetworkConfig } from '../../config/networks';
import { displayError } from '../../utils/display';
import chalk from 'chalk';
import ora from 'ora';

interface PriceOptions {
  slab: string;
  network?: string;
  url?: string;
}

export async function priceCommand(options: PriceOptions): Promise<void> {
  const spinner = ora('Loading prices...').start();

  try {
    if (!options.slab) {
      spinner.fail();
      displayError('Missing required option: --slab <address>');
      process.exit(1);
    }

    // Load network configuration
    const config = getNetworkConfig(options.network);
    const rpcUrl = options.url || config.rpcUrl;

    // Connect to Solana
    const connection = new Connection(rpcUrl, 'confirmed');

    // Create SlabClient
    const client = new SlabClient(connection, config.slabProgramId);

    const slabAddress = new PublicKey(options.slab);

    spinner.text = 'Fetching best prices...';

    // Get best prices
    const prices = await client.getBestPrices(slabAddress);

    spinner.succeed();

    // Display prices
    console.log(chalk.bold.cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.bold.cyan(`MARKET PRICES - ${options.slab.substring(0, 8)}...`));
    console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log();

    if (prices.bid) {
      const bidStr = `$${formatAmount(prices.bid.price, 6)}`;
      console.log(`${chalk.bold.green('Best Bid:')}  ${bidStr}`);
    } else {
      console.log(`${chalk.bold.green('Best Bid:')}  ${chalk.gray('--')}`);
    }

    if (prices.ask) {
      const askStr = `$${formatAmount(prices.ask.price, 6)}`;
      console.log(`${chalk.bold.red('Best Ask:')}  ${askStr}`);
    } else {
      console.log(`${chalk.bold.red('Best Ask:')}  ${chalk.gray('--')}`);
    }

    if (prices.spread) {
      const spreadStr = `$${formatAmount(prices.spread, 6)}`;
      console.log();
      console.log(`${chalk.bold('Spread:')}     ${spreadStr} (${prices.spreadBps?.toString() || '0'} bps)`);
    }

    console.log();
    console.log(chalk.gray('Note: v0 prices are derived from mark price (atomic fills only)'));
    console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
  } catch (error: any) {
    spinner.fail();
    displayError(`Failed to fetch prices: ${error.message}`);
    process.exit(1);
  }
}
