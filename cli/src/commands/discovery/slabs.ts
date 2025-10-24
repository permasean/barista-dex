import { Connection } from '@solana/web3.js';
import { RouterClient, formatAmount, truncatePubkey } from '@barista-dex/sdk';
import { getNetworkConfig } from '../../config/networks';
import { displayError } from '../../utils/display';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';

interface SlabsOptions {
  network?: string;
  url?: string;
}

export async function slabsCommand(options: SlabsOptions): Promise<void> {
  const spinner = ora('Loading slabs...').start();

  try {
    // Load network configuration
    const config = getNetworkConfig(options.network);
    const rpcUrl = options.url || config.rpcUrl;

    // Connect to Solana
    const connection = new Connection(rpcUrl, 'confirmed');

    // Create RouterClient
    const client = new RouterClient(connection, config.routerProgramId);

    spinner.text = 'Fetching all slabs from network...';

    // Get all slabs
    const slabs = await client.getAllSlabs(config.slabProgramId);

    spinner.succeed();

    if (slabs.length === 0) {
      console.log(chalk.yellow('No slabs found on this network.'));
      return;
    }

    console.log(chalk.bold.cyan(`\nFound ${slabs.length} slab(s):\n`));

    // Create table
    const table = new Table({
      head: [
        chalk.cyan('Slab Address'),
        chalk.cyan('LP Owner'),
        chalk.cyan('Instrument'),
        chalk.cyan('Mark Price'),
        chalk.cyan('Taker Fee'),
      ],
      colWidths: [20, 20, 20, 18, 14],
    });

    // Add rows
    for (const slab of slabs) {
      // Format price (markPx is in 1e6 scale, divide by 1M for display)
      const priceStr = `$${formatAmount(slab.markPx, 6)}`;
      // Format fee (takerFeeBps is already in basis points)
      const feeNum = slab.takerFeeBps.toNumber();
      const feeStr = `${(feeNum / 100).toFixed(2)}%`;

      table.push([
        truncatePubkey(slab.address.toBase58()),
        truncatePubkey(slab.lpOwner.toBase58()),
        truncatePubkey(slab.instrument.toBase58()),
        priceStr,
        feeStr,
      ]);
    }

    console.log(table.toString());
    console.log();
    console.log(chalk.gray('Use "barista slab info --slab <address>" to see details'));
    console.log();
  } catch (error: any) {
    spinner.fail();
    displayError(`Failed to fetch slabs: ${error.message}`);
    process.exit(1);
  }
}
