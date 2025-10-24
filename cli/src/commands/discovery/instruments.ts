import { Connection, PublicKey } from '@solana/web3.js';
import { SlabClient, formatAmount } from '@barista-dex/sdk';
import { getNetworkConfig } from '../../config/networks';
import { displayError } from '../../utils/display';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';

interface InstrumentsOptions {
  slab: string;
  network?: string;
  url?: string;
}

export async function instrumentsCommand(options: InstrumentsOptions): Promise<void> {
  const spinner = ora('Loading instruments...').start();

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

    spinner.text = 'Fetching instruments...';

    // Get instruments
    const instruments = await client.getInstruments(slabAddress);

    spinner.succeed();

    console.log(chalk.bold.cyan(`\nInstruments in slab ${slabAddress.toBase58()}:\n`));

    // Create table
    const table = new Table({
      head: [
        chalk.cyan('Index'),
        chalk.cyan('Instrument ID'),
        chalk.cyan('Mark Price'),
        chalk.cyan('Contract Size'),
        chalk.cyan('Taker Fee'),
      ],
      colWidths: [8, 46, 18, 16, 14],
    });

    // Add rows
    for (const instrument of instruments) {
      const priceStr = `$${formatAmount(instrument.markPx, 6)}`;
      const feeNum = instrument.takerFeeBps.toNumber();
      const feeStr = `${(feeNum / 100).toFixed(2)}%`;

      table.push([
        instrument.index.toString(),
        instrument.pubkey.toBase58(),
        priceStr,
        instrument.contractSize.toString(),
        feeStr,
      ]);
    }

    console.log(table.toString());
    console.log();

    if (instruments.length === 1) {
      console.log(chalk.gray('Note: v0 has 1 instrument per slab. Future versions will support up to 32.'));
    }

    console.log();
  } catch (error: any) {
    spinner.fail();
    displayError(`Failed to fetch instruments: ${error.message}`);
    process.exit(1);
  }
}
