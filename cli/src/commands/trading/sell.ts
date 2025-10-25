import { Connection, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { RouterClient } from '@barista-dex/sdk';
import { loadKeypair, getDefaultKeypairPath } from '../../utils/wallet';
import { displaySuccess, displayError, getExplorerUrl } from '../../utils/display';
import { getNetworkConfig } from '../../config/networks';
import chalk from 'chalk';
import ora from 'ora';
import BN from 'bn.js';

interface SellOptions {
  slab: string;
  quantity: string;
  price: string;
  leverage?: string;  // Optional: "5x", "10x", etc. Default: 1x (spot)
  keypair?: string;
  url?: string;
  network?: string;
}

/**
 * Parse leverage string to number
 * @param leverageStr "5x", "10x", or just "5", "10"
 * @returns Leverage as number (1-10)
 */
function parseLeverage(leverageStr: string): number {
  const cleaned = leverageStr.toLowerCase().replace('x', '').trim();
  const leverage = parseFloat(cleaned);

  if (isNaN(leverage) || leverage < 1 || leverage > 10) {
    throw new Error('Leverage must be between 1x and 10x');
  }

  return leverage;
}

export async function sellCommand(options: SellOptions): Promise<void> {
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

    // Parse leverage (default to 1x for spot)
    const leverage = options.leverage ? parseLeverage(options.leverage) : 1;
    const isSpot = leverage === 1;

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

    // Parse inputs
    const slabMarket = new PublicKey(options.slab);
    const quantity = new BN(options.quantity);
    const limitPrice = new BN(options.price);

    // Validate position with leverage
    spinner.text = 'Validating position...';
    const validation = await client.validateLeveragedPosition(
      wallet.publicKey,
      quantity,
      limitPrice,
      leverage
    );

    if (!validation.valid) {
      spinner.fail();
      console.log();
      displayError('Insufficient margin for this position');
      console.log();
      console.log(chalk.gray('  Position Details:'));
      console.log(chalk.gray(`    Mode: ${validation.mode === 'spot' ? 'Spot (1x)' : `Margin (${leverage}x)`}`));
      console.log(chalk.gray(`    Notional: ${validation.notional.toString()} units`));
      console.log(chalk.gray(`    Required margin: ${validation.requiredMargin.toString()} units`));
      console.log(chalk.red(`    Available equity: ${validation.availableEquity.toString()} units`));
      console.log();

      if (isSpot) {
        console.log(chalk.yellow('  Tip: For spot trading, you need the full notional value.'));
        console.log(chalk.yellow('       Try using leverage (--leverage 5x) to trade with less collateral.'));
      } else {
        const maxQty = await client.calculateMaxQuantity(wallet.publicKey, limitPrice, leverage);
        console.log(chalk.yellow(`  Tip: Maximum quantity at ${leverage}x leverage: ${maxQty.toString()} units`));
      }
      process.exit(1);
    }

    // Display position summary
    spinner.stop();
    console.log();
    console.log(chalk.cyan('  Position Summary:'));
    console.log(chalk.gray(`    Mode: ${validation.mode === 'spot' ? chalk.green('Spot (1x)') : chalk.yellow(`Margin (${leverage}x)`)}`));
    console.log(chalk.gray(`    Quantity: ${quantity.toString()} units`));
    console.log(chalk.gray(`    Price: ${limitPrice.toString()}`));
    console.log(chalk.gray(`    Notional: ${validation.notional.toString()} units`));
    console.log(chalk.gray(`    Required margin: ${validation.requiredMargin.toString()} units`));
    console.log(chalk.gray(`    Available equity: ${validation.availableEquity.toString()} units`));

    // Show warnings for high leverage
    if (leverage >= 8) {
      console.log();
      console.log(chalk.red(`  ⚠️  WARNING: High leverage (${leverage}x) increases liquidation risk!`));
    } else if (leverage >= 5) {
      console.log();
      console.log(chalk.yellow(`  ⚠️  Caution: Using ${leverage}x leverage increases risk`));
    }

    // Confirm for margin trades
    if (!isSpot) {
      console.log();
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise<string>((resolve) => {
        readline.question(chalk.yellow('  Continue with margin trade? (y/N): '), resolve);
      });
      readline.close();

      if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        console.log(chalk.gray('  Trade cancelled.'));
        process.exit(0);
      }
    }

    console.log();
    spinner.start('Building sell transaction...');

    // Build sell instruction (v0 atomic fill) - uses network config for slab program
    const sellIx = client.buildSellInstruction(
      wallet.publicKey,
      slabMarket,
      quantity,
      limitPrice,
      config.slabProgramId
    );

    const transaction = new Transaction().add(sellIx);

    // Send and confirm transaction
    spinner.text = 'Sending transaction...';
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [wallet],
      { commitment: 'confirmed' }
    );

    spinner.succeed();
    displaySuccess('Sell order executed successfully!');

    console.log(chalk.gray(`  Signature: ${signature}`));
    console.log(chalk.gray(`  Explorer: ${getExplorerUrl(signature, options.network || 'mainnet-beta')}`));
    console.log();
    console.log(chalk.cyan('  Note: v0 uses atomic fills - order executed immediately or failed'));
  } catch (error: any) {
    spinner.fail();
    displayError(`Sell order failed: ${error.message}`);
    process.exit(1);
  }
}
