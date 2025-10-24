import { Connection, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { RouterClient } from '@barista-dex/sdk';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { loadKeypair, loadConfig, getDefaultKeypairPath } from '../../utils/wallet';
import { displaySuccess, displayError, getExplorerUrl } from '../../utils/display';
import chalk from 'chalk';
import ora from 'ora';
import BN from 'bn.js';

interface WithdrawOptions {
  mint: string;
  amount: string;
  keypair?: string;
  url?: string;
}

export async function withdrawCommand(options: WithdrawOptions): Promise<void> {
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

    spinner.text = 'Building withdraw transaction...';

    // Parse inputs
    const mint = new PublicKey(options.mint);
    const amount = new BN(options.amount);

    // Get user's token account
    spinner.text = 'Finding user token account...';
    const userTokenAccount = await getAssociatedTokenAddress(
      mint,
      wallet.publicKey
    );

    // Build withdraw instruction
    spinner.text = 'Building withdraw transaction...';
    const withdrawIx = client.buildWithdrawInstruction(
      mint,
      amount,
      wallet.publicKey,
      userTokenAccount
    );

    const transaction = new Transaction().add(withdrawIx);

    // Send and confirm transaction
    spinner.text = 'Sending transaction...';
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [wallet],
      { commitment: 'confirmed' }
    );

    spinner.succeed();
    displaySuccess('Withdrawal successful!');

    console.log(chalk.gray(`  Signature: ${signature}`));
    console.log(chalk.gray(`  Explorer: ${getExplorerUrl(signature, config.network)}`));
  } catch (error: any) {
    spinner.fail();
    displayError(`Withdrawal failed: ${error.message}`);
    process.exit(1);
  }
}
