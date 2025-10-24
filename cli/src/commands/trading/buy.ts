import { Connection, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { RouterClient } from '@barista-dex/sdk';
import { loadKeypair, getDefaultKeypairPath } from '../../utils/wallet';
import { displaySuccess, displayError, getExplorerUrl } from '../../utils/display';
import { getNetworkConfig } from '../../config/networks';
import chalk from 'chalk';
import ora from 'ora';
import BN from 'bn.js';

interface BuyOptions {
  slab: string;
  quantity: string;
  price: string;
  keypair?: string;
  url?: string;
  network?: string;
}

export async function buyCommand(options: BuyOptions): Promise<void> {
  const spinner = ora('Loading configuration...').start();

  try {
    // Validate required options
    if (!options.slab) {
      spinner.fail();
      displayError('Missing required option: --slab <address>');
      process.exit(1);
    }

    if (!options.quantity) {
      spinner.fail();
      displayError('Missing required option: --quantity <amount>');
      process.exit(1);
    }

    if (!options.price) {
      spinner.fail();
      displayError('Missing required option: --price <price>');
      process.exit(1);
    }

    // Load network configuration (uses env vars for overrides)
    const config = getNetworkConfig(options.network);

    // Override RPC URL if provided
    const rpcUrl = options.url || config.rpcUrl;

    const keypairPath = options.keypair || getDefaultKeypairPath();
    const wallet = loadKeypair(keypairPath);

    spinner.text = `Using wallet: ${wallet.publicKey.toBase58()}`;

    // Connect to Solana
    const connection = new Connection(rpcUrl, 'confirmed');

    spinner.text = 'Connecting to Solana...';

    // Create RouterClient
    const client = new RouterClient(
      connection,
      config.routerProgramId,
      wallet
    );

    spinner.text = 'Building buy transaction...';

    // Parse inputs
    const slabMarket = new PublicKey(options.slab);
    const quantity = new BN(options.quantity);
    const limitPrice = new BN(options.price);

    // Build buy instruction (v0 atomic fill) - uses network config for slab program
    const buyIx = client.buildBuyInstruction(
      wallet.publicKey,
      slabMarket,
      quantity,
      limitPrice,
      config.slabProgramId
    );

    const transaction = new Transaction().add(buyIx);

    // Send and confirm transaction
    spinner.text = 'Sending transaction...';
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [wallet],
      { commitment: 'confirmed' }
    );

    spinner.succeed();
    displaySuccess('Buy order executed successfully!');

    console.log(chalk.gray(`  Signature: ${signature}`));
    console.log(chalk.gray(`  Explorer: ${getExplorerUrl(signature, options.network || 'mainnet-beta')}`));
    console.log();
    console.log(chalk.cyan('  Note: v0 uses atomic fills - order executed immediately or failed'));
  } catch (error: any) {
    spinner.fail();
    displayError(`Buy order failed: ${error.message}`);
    process.exit(1);
  }
}
