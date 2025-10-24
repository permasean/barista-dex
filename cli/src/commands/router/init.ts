import { Connection, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { RouterClient } from '@barista-dex/sdk';
import { loadKeypair, loadConfig, getDefaultKeypairPath } from '../../utils/wallet';
import { displaySuccess, displayError, getExplorerUrl } from '../../utils/display';
import chalk from 'chalk';
import ora from 'ora';

interface InitOptions {
  keypair?: string;
  url?: string;
}

export async function initCommand(options: InitOptions): Promise<void> {
  const spinner = ora('Loading configuration...').start();

  try {
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

    // Check if portfolio already exists
    spinner.text = 'Checking if portfolio exists...';
    const existingPortfolio = await client.getPortfolio(wallet.publicKey);

    if (existingPortfolio) {
      spinner.warn('Portfolio already initialized');
      console.log(chalk.yellow('\n⚠ Portfolio already exists for this wallet\n'));
      console.log(chalk.gray(`Use 'barista portfolio' to view it`));
      return;
    }

    spinner.text = 'Building initialize portfolio transaction...';

    // Build init portfolio instruction
    const initIx = client.buildInitializePortfolioInstruction(wallet.publicKey);
    const transaction = new Transaction().add(initIx);

    // Send and confirm transaction
    spinner.text = 'Initializing portfolio...';
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [wallet],
      { commitment: 'confirmed' }
    );

    spinner.succeed();
    displaySuccess('Portfolio initialized!');

    console.log(chalk.gray(`  Wallet: ${wallet.publicKey.toBase58()}`));
    console.log(chalk.gray(`  Signature: ${signature}`));
    console.log(chalk.gray(`  Explorer: ${getExplorerUrl(signature, config.network)}`));
    console.log(chalk.gray(`\nYou can now deposit collateral and start trading!`));
  } catch (error: any) {
    spinner.fail();
    displayError(`Portfolio initialization failed: ${error.message}`);
    process.exit(1);
  }
}
