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
  price?: string;  // Optional: if not provided, market order
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

    // Parse leverage (default to 1x for spot)
    const leverage = options.leverage ? parseLeverage(options.leverage) : 1;
    const isSpot = leverage === 1;
    const isMarketOrder = !options.price;

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
    const quantityInput = new BN(options.quantity);

    // Get price (either from user or fetch market price)
    let price: BN;
    if (isMarketOrder) {
      spinner.text = 'Fetching market price...';
      price = await client.getMarketPrice(slabMarket, config.slabProgramId);
      console.log(chalk.gray(`  Market price: ${price.toString()}`));
    } else {
      price = new BN(options.price!);
    }

    // Validate position with NEW leverage model
    // quantityInput represents margin to commit, leverage multiplies it
    spinner.text = 'Validating position...';
    const validation = await client.validateLeveragedPosition(
      wallet.publicKey,
      quantityInput,
      price,
      leverage
    );

    if (!validation.valid) {
      spinner.fail();
      console.log();
      displayError('Insufficient equity for this trade');
      console.log();
      console.log(chalk.gray('  Trade Details:'));
      console.log(chalk.gray(`    Mode: ${validation.mode === 'spot' ? 'Spot (1x)' : `Margin (${leverage}x)`}`));
      console.log(chalk.gray(`    Quantity input: ${quantityInput.toString()} units`));
      console.log(chalk.gray(`    Price: ${price.toString()}`));
      console.log(chalk.gray(`    Margin committed: ${validation.marginCommitted.toString()} units`));
      console.log(chalk.gray(`    Actual position size: ${validation.positionSize.toString()} units`));
      console.log(chalk.gray(`    Actual quantity traded: ${validation.actualQuantity.toString()} contracts`));
      console.log(chalk.red(`    Available equity: ${validation.availableEquity.toString()} units`));
      console.log();

      const maxQty = await client.calculateMaxQuantityInput(wallet.publicKey, price, leverage);
      console.log(chalk.yellow(`  Tip: Maximum quantity input: ${maxQty.toString()} units`));
      if (leverage > 1) {
        console.log(chalk.yellow(`       (This will open ${maxQty.mul(new BN(leverage)).toString()} contracts with ${leverage}x leverage)`));
      }
      process.exit(1);
    }

    // Display position summary
    spinner.stop();
    console.log();
    console.log(chalk.cyan('  Trade Summary:'));
    console.log(chalk.gray(`    Order type: ${isMarketOrder ? chalk.yellow('Market') : chalk.green('Limit')}`));
    console.log(chalk.gray(`    Mode: ${validation.mode === 'spot' ? chalk.green('Spot (1x)') : chalk.yellow(`Margin (${leverage}x)`)}`));
    console.log(chalk.gray(`    Quantity input: ${quantityInput.toString()} units`));
    console.log(chalk.gray(`    Price: ${price.toString()}`));
    console.log(chalk.gray(`    Margin committed: ${validation.marginCommitted.toString()} units`));
    console.log(chalk.cyan(`    → Actual position: ${validation.positionSize.toString()} units (${validation.actualQuantity.toString()} contracts)`));
    console.log(chalk.gray(`    Available equity: ${validation.availableEquity.toString()} units`));

    // Show warnings for high leverage
    if (leverage >= 8) {
      console.log();
      console.log(chalk.red(`  ⚠️  WARNING: High leverage (${leverage}x) increases liquidation risk!`));
    } else if (leverage >= 5) {
      console.log();
      console.log(chalk.yellow(`  ⚠️  Caution: Using ${leverage}x leverage increases risk`));
    }

    // Confirm for margin trades or market orders
    if (!isSpot || isMarketOrder) {
      console.log();
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const promptMsg = isMarketOrder
        ? '  Execute market order? (y/N): '
        : '  Continue with margin trade? (y/N): ';

      const answer = await new Promise<string>((resolve) => {
        readline.question(chalk.yellow(promptMsg), resolve);
      });
      readline.close();

      if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        console.log(chalk.gray('  Trade cancelled.'));
        process.exit(0);
      }
    }

    console.log();
    spinner.start('Building sell transaction...');

    // Build sell instruction with ACTUAL quantity (leveraged)
    const sellIx = client.buildSellInstruction(
      wallet.publicKey,
      slabMarket,
      validation.actualQuantity,  // Use leveraged quantity!
      price,
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
    displaySuccess(`Sell order executed successfully!`);

    console.log(chalk.gray(`  Signature: ${signature}`));
    console.log(chalk.gray(`  Explorer: ${getExplorerUrl(signature, options.network || 'mainnet-beta')}`));
    console.log();
    console.log(chalk.cyan(`  Position opened: ${validation.actualQuantity.toString()} contracts`));
    console.log(chalk.cyan(`  Margin used: ${validation.marginCommitted.toString()} units`));
    console.log(chalk.cyan(`  Effective leverage: ${leverage}x`));
  } catch (error: any) {
    spinner.fail();
    displayError(`Sell order failed: ${error.message}`);
    process.exit(1);
  }
}
