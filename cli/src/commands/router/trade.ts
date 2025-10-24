import { Connection, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { RouterClient } from '@barista-dex/sdk';
import { loadKeypair, loadConfig, getDefaultKeypairPath } from '../../utils/wallet';
import { displaySuccess, displayError, getExplorerUrl } from '../../utils/display';
import chalk from 'chalk';
import ora from 'ora';
import BN from 'bn.js';

interface TradeOptions {
  slab: string;
  side: 'buy' | 'sell';
  size: string;
  price: string;
  keypair?: string;
  url?: string;
}

export async function tradeCommand(options: TradeOptions): Promise<void> {
  const spinner = ora('Loading configuration...').start();

  try {
    // Validate required options
    if (!options.slab) {
      spinner.fail();
      displayError('Missing required option: --slab <address>');
      process.exit(1);
    }

    if (!options.side) {
      spinner.fail();
      displayError('Missing required option: --side <buy|sell>');
      process.exit(1);
    }

    if (!options.size) {
      spinner.fail();
      displayError('Missing required option: --size <amount>');
      process.exit(1);
    }

    if (!options.price) {
      spinner.fail();
      displayError('Missing required option: --price <price>');
      process.exit(1);
    }

    // Validate side
    if (options.side !== 'buy' && options.side !== 'sell') {
      spinner.fail();
      displayError('Invalid side. Must be "buy" or "sell"');
      process.exit(1);
    }

    // Load configuration
    const config = loadConfig();
    const keypairPath = options.keypair || getDefaultKeypairPath();
    const wallet = loadKeypair(keypairPath);

    spinner.text = `Using wallet: ${wallet.publicKey.toBase58()}`;

    // Connect to Solana
    const rpcUrl = options.url || config.rpcUrl || 'http://localhost:8899';
    const connection = new Connection(rpcUrl, 'confirmed');

    spinner.text = 'Connecting to Solana...';

    // Create RouterClient
    const client = new RouterClient(
      connection,
      new PublicKey(config.routerProgramId),
      wallet
    );

    spinner.text = 'Building trade transaction...';

    // Parse inputs
    const slabMarket = new PublicKey(options.slab);
    const size = new BN(options.size);
    const price = new BN(options.price);
    const isBuy = options.side === 'buy';

    // Build cross-slab execution instruction
    const splits = [
      {
        slabMarket,
        isBuy,
        size,
        price,
      },
    ];

    const tradeIx = client.buildExecuteCrossSlabInstruction(
      wallet.publicKey,
      splits,
      new PublicKey(config.slabProgramId)
    );

    const transaction = new Transaction().add(tradeIx);

    // Send and confirm transaction
    spinner.text = `Sending ${options.side} order...`;
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [wallet],
      { commitment: 'confirmed' }
    );

    spinner.succeed();
    displaySuccess(`${options.side.toUpperCase()} order executed!`);

    console.log(chalk.gray(`  Side: ${options.side}`));
    console.log(chalk.gray(`  Size: ${options.size}`));
    console.log(chalk.gray(`  Price: ${options.price}`));
    console.log(chalk.gray(`  Signature: ${signature}`));
    console.log(chalk.gray(`  Explorer: ${getExplorerUrl(signature, config.network)}`));
  } catch (error: any) {
    spinner.fail();
    displayError(`Trade failed: ${error.message}`);
    process.exit(1);
  }
}
