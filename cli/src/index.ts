#!/usr/bin/env node

import { Command } from 'commander';
import { depositCommand } from './commands/router/deposit';
import { withdrawCommand } from './commands/router/withdraw';
import { portfolioCommand } from './commands/router/portfolio';
import { priceCommand as legacyPriceCommand } from './commands/market/price';
import { bookCommand } from './commands/market/book';
import { buyCommand } from './commands/trading/buy';
import { sellCommand } from './commands/trading/sell';
import { slabsCommand } from './commands/discovery/slabs';
import { slabInfoCommand } from './commands/discovery/slabInfo';
import { instrumentsCommand } from './commands/discovery/instruments';
import { priceCommand } from './commands/discovery/price';

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
// Trading Commands (v0 - Atomic Fills)
// ============================================================

program
  .command('buy')
  .description('Execute a buy order (market or limit)')
  .requiredOption('--slab <address>', 'Slab market address')
  .requiredOption('-q, --quantity <amount>', 'Margin to commit (in base units). With leverage, actual position = quantity × leverage')
  .option('-p, --price <price>', 'Limit price (optional, omit for market order)')
  .option('-l, --leverage <multiplier>', 'Leverage multiplier (e.g., "5x", "10x"). Default: 1x (spot trading)')
  .option('-n, --network <network>', 'Network: devnet, mainnet-beta, or localnet (default: mainnet-beta)')
  .option('-k, --keypair <path>', 'Path to keypair file')
  .option('-u, --url <url>', 'Custom RPC URL (overrides network default)')
  .action(buyCommand);

program
  .command('sell')
  .description('Execute a sell order (market or limit)')
  .requiredOption('--slab <address>', 'Slab market address')
  .requiredOption('-q, --quantity <amount>', 'Margin to commit (in base units). With leverage, actual position = quantity × leverage')
  .option('-p, --price <price>', 'Limit price (optional, omit for market order)')
  .option('-l, --leverage <multiplier>', 'Leverage multiplier (e.g., "5x", "10x"). Default: 1x (spot trading)')
  .option('-n, --network <network>', 'Network: devnet, mainnet-beta, or localnet (default: mainnet-beta)')
  .option('-k, --keypair <path>', 'Path to keypair file')
  .option('-u, --url <url>', 'Custom RPC URL (overrides network default)')
  .action(sellCommand);

// ============================================================
// Discovery Commands
// ============================================================

program
  .command('slabs')
  .description('List all available LP-run slabs')
  .option('-n, --network <network>', 'Network: devnet, mainnet-beta, or localnet (default: mainnet-beta)')
  .option('-u, --url <url>', 'Custom RPC URL (overrides network default)')
  .action(slabsCommand);

program
  .command('slab')
  .description('Show detailed information about a slab')
  .requiredOption('--slab <address>', 'Slab address')
  .option('-n, --network <network>', 'Network: devnet, mainnet-beta, or localnet (default: mainnet-beta)')
  .option('-u, --url <url>', 'Custom RPC URL (overrides network default)')
  .action(slabInfoCommand);

program
  .command('instruments')
  .description('List instruments (markets) in a slab (v0: returns 1, future: up to 32)')
  .requiredOption('--slab <address>', 'Slab address')
  .option('-n, --network <network>', 'Network: devnet, mainnet-beta, or localnet (default: mainnet-beta)')
  .option('-u, --url <url>', 'Custom RPC URL (overrides network default)')
  .action(instrumentsCommand);

// ============================================================
// Market Data Commands
// ============================================================

program
  .command('price')
  .description('Get current market price (best bid/ask)')
  .requiredOption('--slab <address>', 'Slab address')
  .option('-n, --network <network>', 'Network: devnet, mainnet-beta, or localnet (default: mainnet-beta)')
  .option('-u, --url <url>', 'Custom RPC URL (overrides network default)')
  .action(priceCommand);

program
  .command('book')
  .description('View order book depth (v0: stub - no persistent orders)')
  .requiredOption('--slab <address>', 'Slab address')
  .option('-l, --levels <number>', 'Number of price levels to display (default: 10)')
  .option('-n, --network <network>', 'Network: devnet, mainnet-beta, or localnet (default: mainnet-beta)')
  .option('-u, --url <url>', 'Custom RPC URL (overrides network default)')
  .action(bookCommand);

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
