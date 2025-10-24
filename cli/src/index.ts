#!/usr/bin/env node

import { Command } from 'commander';
import { depositCommand } from './commands/router/deposit';
import { withdrawCommand } from './commands/router/withdraw';
import { portfolioCommand } from './commands/router/portfolio';
import { priceCommand } from './commands/market/price';
import { bookCommand } from './commands/market/book';

const program = new Command();

program
  .name('barista')
  .description('Command-line interface for Barista DEX')
  .version('0.1.0');

// ============================================================
// Portfolio Commands
// ============================================================

program
  .command('portfolio')
  .description('View portfolio state')
  .option('-a, --address <address>', 'User address (defaults to keypair pubkey)')
  .option('-n, --network <network>', 'Network: devnet, mainnet-beta, or localnet (default: mainnet-beta)')
  .option('-k, --keypair <path>', 'Path to keypair file')
  .option('-u, --url <url>', 'Custom RPC URL (overrides network default)')
  .action(portfolioCommand);

program
  .command('deposit')
  .description('Deposit collateral to vault')
  .requiredOption('-m, --mint <address>', 'Token mint address')
  .requiredOption('-a, --amount <amount>', 'Amount to deposit (in base units)')
  .option('-n, --network <network>', 'Network: devnet, mainnet-beta, or localnet (default: mainnet-beta)')
  .option('-k, --keypair <path>', 'Path to keypair file')
  .option('-u, --url <url>', 'Custom RPC URL')
  .action(depositCommand);

program
  .command('withdraw')
  .description('Withdraw collateral from vault')
  .requiredOption('-m, --mint <address>', 'Token mint address')
  .requiredOption('-a, --amount <amount>', 'Amount to withdraw (in base units)')
  .option('-n, --network <network>', 'Network: devnet, mainnet-beta, or localnet (default: mainnet-beta)')
  .option('-k, --keypair <path>', 'Path to keypair file')
  .option('-u, --url <url>', 'Custom RPC URL')
  .action(withdrawCommand);

// ============================================================
// Market Data Commands
// ============================================================

program
  .command('price')
  .description('Get current market price (best bid/ask)')
  .requiredOption('--slab <address>', 'Market address')
  .option('-n, --network <network>', 'Network: devnet, mainnet-beta, or localnet (default: mainnet-beta)')
  .option('-u, --url <url>', 'Custom RPC URL')
  .action(priceCommand);

program
  .command('book')
  .description('View order book depth')
  .requiredOption('--slab <address>', 'Market address')
  .option('-l, --levels <number>', 'Number of price levels to display (default: 10)')
  .option('-n, --network <network>', 'Network: devnet, mainnet-beta, or localnet (default: mainnet-beta)')
  .option('-u, --url <url>', 'Custom RPC URL')
  .action(bookCommand);

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
