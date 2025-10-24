#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/router/init';
import { depositCommand } from './commands/router/deposit';
import { withdrawCommand } from './commands/router/withdraw';
import { portfolioCommand } from './commands/router/portfolio';
import { tradeCommand } from './commands/router/trade';
import { priceCommand } from './commands/market/price';
import { bookCommand } from './commands/market/book';

const program = new Command();

program
  .name('barista')
  .description('Command-line interface for Barista DEX')
  .version('0.1.0');

// ============================================================
// Router Commands (Portfolio & Trading)
// ============================================================

program
  .command('init')
  .description('Initialize portfolio account')
  .option('-k, --keypair <path>', 'Path to keypair file (default: ~/.config/solana/id.json)')
  .option('-u, --url <url>', 'RPC URL (default: from config or localhost:8899)')
  .action(initCommand);

program
  .command('portfolio')
  .description('View portfolio state')
  .option('-a, --address <address>', 'User address (defaults to keypair pubkey)')
  .option('-k, --keypair <path>', 'Path to keypair file')
  .option('-u, --url <url>', 'RPC URL')
  .action(portfolioCommand);

program
  .command('deposit')
  .description('Deposit collateral to vault')
  .requiredOption('-m, --mint <address>', 'Token mint address')
  .requiredOption('-a, --amount <amount>', 'Amount to deposit (in base units)')
  .option('-k, --keypair <path>', 'Path to keypair file')
  .option('-u, --url <url>', 'RPC URL')
  .action(depositCommand);

program
  .command('withdraw')
  .description('Withdraw collateral from vault')
  .requiredOption('-m, --mint <address>', 'Token mint address')
  .requiredOption('-a, --amount <amount>', 'Amount to withdraw (in base units)')
  .option('-k, --keypair <path>', 'Path to keypair file')
  .option('-u, --url <url>', 'RPC URL')
  .action(withdrawCommand);

program
  .command('trade')
  .description('Execute cross-slab trade')
  .requiredOption('--slab <address>', 'Slab market address')
  .requiredOption('--side <side>', 'Order side: buy or sell')
  .requiredOption('--size <amount>', 'Order size (in base units)')
  .requiredOption('--price <price>', 'Limit price (in base units)')
  .option('-k, --keypair <path>', 'Path to keypair file')
  .option('-u, --url <url>', 'RPC URL')
  .action(tradeCommand);

// ============================================================
// Market Data Commands
// ============================================================

program
  .command('price')
  .description('Get current market price (best bid/ask)')
  .requiredOption('--slab <address>', 'Slab market address')
  .option('-u, --url <url>', 'RPC URL')
  .action(priceCommand);

program
  .command('book')
  .description('View order book depth')
  .requiredOption('--slab <address>', 'Slab market address')
  .option('-l, --levels <number>', 'Number of price levels to display (default: 10)')
  .option('-u, --url <url>', 'RPC URL')
  .action(bookCommand);

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
