import { Connection, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { RouterClient, Cluster } from '@barista-dex/sdk';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { loadKeypair, getConfig, getDefaultKeypairPath } from '../../utils/wallet';
import { displaySuccess, displayError, getExplorerUrl } from '../../utils/display';
import chalk from 'chalk';
import ora from 'ora';
import BN from 'bn.js';

interface DepositOptions {
  mint: string;
  amount: string;
  keypair?: string;
  url?: string;
  network?: string;
}

export async function depositCommand(options: DepositOptions): Promise<void> {
  const spinner = ora('Loading configuration...').start();

  try {
    // Validate required options
    if (!options.mint) {
      spinner.fail();
      displayError('Missing required option: --mint <address>');
      process.exit(1);
    }

    if (!options.amount) {
      spinner.fail();
      displayError('Missing required option: --amount <amount>');
      process.exit(1);
    }

    // Load configuration (uses env vars if not provided)
    const cluster = options.network as Cluster | undefined;
    const config = getConfig(cluster, options.url);
    const keypairPath = options.keypair || getDefaultKeypairPath();
    const wallet = loadKeypair(keypairPath);

    spinner.text = `Using wallet: ${wallet.publicKey.toBase58()}`;

    // Connect to Solana
    const connection = new Connection(config.rpcUrl, 'confirmed');

    spinner.text = 'Connecting to Solana...';

    // Create RouterClient
    const client = new RouterClient(
      connection,
      new PublicKey(config.routerProgramId),
      wallet
    );

    spinner.text = 'Building deposit transaction...';

    // Parse inputs
    const mint = new PublicKey(options.mint);
    const amount = new BN(options.amount);

    // Get user's token account
    spinner.text = 'Finding user token account...';
    const userTokenAccount = await getAssociatedTokenAddress(
      mint,
      wallet.publicKey
    );

    // Build deposit instruction
    spinner.text = 'Building deposit transaction...';
    const depositIx = client.buildDepositInstruction(
      mint,
      amount,
      wallet.publicKey,
      userTokenAccount
    );

    const transaction = new Transaction().add(depositIx);

    // Send and confirm transaction
    spinner.text = 'Sending transaction...';
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [wallet],
      { commitment: 'confirmed' }
    );

    spinner.succeed();
    displaySuccess('Deposit successful!');

    console.log(chalk.gray(`  Signature: ${signature}`));
    console.log(chalk.gray(`  Explorer: ${getExplorerUrl(signature, config.cluster)}`));
  } catch (error: any) {
    spinner.fail();
    displayError(`Deposit failed: ${error.message}`);
    process.exit(1);
  }
}
