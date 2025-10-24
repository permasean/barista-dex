import { Connection, PublicKey } from '@solana/web3.js';
import { SlabClient, formatAmount } from '@barista-dex/sdk';
import { getNetworkConfig } from '../../config/networks';
import { displayError } from '../../utils/display';
import chalk from 'chalk';
import ora from 'ora';

interface SlabInfoOptions {
  slab: string;
  network?: string;
  url?: string;
}

export async function slabInfoCommand(options: SlabInfoOptions): Promise<void> {
  const spinner = ora('Loading slab info...').start();

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

    spinner.text = 'Fetching slab state...';

    // Get slab state
    const state = await client.getSlabState(slabAddress);

    if (!state) {
      spinner.fail();
      displayError('Slab not found');
      process.exit(1);
    }

    spinner.succeed();

    // Display slab info
    console.log(chalk.bold.cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.bold.cyan('SLAB INFORMATION'));
    console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log();
    console.log(`${chalk.bold('Slab Address:')}     ${slabAddress.toBase58()}`);
    console.log(`${chalk.bold('LP Owner:')}         ${state.lpOwner.toBase58()}`);
    console.log(`${chalk.bold('Router Program:')}   ${state.routerId.toBase58()}`);
    console.log(`${chalk.bold('Instrument:')}       ${state.instrument.toBase58()}`);
    console.log();
    console.log(chalk.bold('Market Parameters:'));
    const priceStr = `$${formatAmount(state.markPx, 6)}`;
    const feeNum = state.takerFeeBps.toNumber();
    const feeStr = `${(feeNum / 100).toFixed(2)}%`;
    console.log(`  Mark Price:      ${priceStr}`);
    console.log(`  Contract Size:   ${state.contractSize.toString()}`);
    console.log(`  Taker Fee:       ${feeStr}`);
    console.log(`  Sequence Number: ${state.seqno}`);
    console.log();
    console.log(chalk.gray('Note: v0 uses atomic fills only (no resting orders)'));
    console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
  } catch (error: any) {
    spinner.fail();
    displayError(`Failed to fetch slab info: ${error.message}`);
    process.exit(1);
  }
}
