#!/usr/bin/env node

import { Command } from 'commander';
import { depositCommand } from './commands/router/deposit';
import { portfolioCommand } from './commands/router/portfolio';
import { priceCommand } from './commands/market/price';

const program = new Command();

program
  .name('barista')
  .description('Command-line interface for Barista DEX')
  .version('0.1.0');

// ============================================================
// Router Commands (Portfolio Management)
// ============================================================

program
  .command('deposit')
  .description('Deposit collateral to vault')
  .requiredOption('-m, --mint <address>', 'Token mint address')
  .requiredOption('-a, --amount <amount>', 'Amount to deposit (in base units)')
  .option('-k, --keypair <path>', 'Path to keypair file (default: ~/.config/solana/id.json)')
  .option('-u, --url <url>', 'RPC URL (default: from config or localhost:8899)')
  .action(depositCommand);

program
  .command('portfolio')
  .description('View portfolio state')
  .option('-a, --address <address>', 'User address (defaults to keypair pubkey)')
  .option('-k, --keypair <path>', 'Path to keypair file')
  .option('-u, --url <url>', 'RPC URL')
  .action(portfolioCommand);

// ============================================================
// Market Data Commands
// ============================================================

program
  .command('price')
  .description('Get current market price from order book')
  .requiredOption('--slab <address>', 'Slab address')
  .option('-u, --url <url>', 'RPC URL')
  .action(priceCommand);

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
