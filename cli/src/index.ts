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
import { initOracleCommand } from './commands/oracle/init';
import { updateOracleCommand } from './commands/oracle/update';
import { showOracleCommand } from './commands/oracle/show';
import { oracleCrankCommand } from './crank/oracle-updater';

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
  .description('Execute a buy order (atomic fill - no resting orders in v0)')
  .requiredOption('--slab <address>', 'Slab market address')
  .requiredOption('-q, --quantity <amount>', 'Quantity to buy (in base units)')
  .requiredOption('-p, --price <price>', 'Limit price (maximum price willing to pay)')
  .option('-n, --network <network>', 'Network: devnet, mainnet-beta, or localnet (default: mainnet-beta)')
  .option('-k, --keypair <path>', 'Path to keypair file')
  .option('-u, --url <url>', 'Custom RPC URL (overrides network default)')
  .action(buyCommand);

program
  .command('sell')
  .description('Execute a sell order (atomic fill - no resting orders in v0)')
  .requiredOption('--slab <address>', 'Slab market address')
  .requiredOption('-q, --quantity <amount>', 'Quantity to sell (in base units)')
  .requiredOption('-p, --price <price>', 'Limit price (minimum price willing to accept)')
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

// ============================================================
// Oracle Commands (Localnet/Devnet)
// ============================================================

const oracleCmd = program
  .command('oracle')
  .description('Oracle management commands (custom oracle for localnet/devnet)');

oracleCmd
  .command('init')
  .description('Initialize a new custom oracle')
  .requiredOption('-i, --instrument <name>', 'Instrument name (e.g., BTC-PERP)')
  .requiredOption('-p, --price <price>', 'Initial price (e.g., 50000)')
  .option('-n, --network <network>', 'Network: devnet or localnet (default: localnet)')
  .option('-k, --keypair <path>', 'Path to payer keypair file')
  .option('-a, --authority <path>', 'Path to authority keypair (defaults to payer)')
  .option('-u, --url <url>', 'Custom RPC URL')
  .action(initOracleCommand);

oracleCmd
  .command('update')
  .description('Update oracle price')
  .requiredOption('-o, --oracle <address>', 'Oracle account address')
  .requiredOption('-p, --price <price>', 'New price (e.g., 51000)')
  .option('-c, --confidence <amount>', 'Confidence interval (±amount, defaults to 0.1% of price)')
  .option('-n, --network <network>', 'Network: devnet or localnet (default: localnet)')
  .option('-k, --keypair <path>', 'Path to payer keypair file')
  .option('-a, --authority <path>', 'Path to authority keypair (defaults to payer)')
  .option('-u, --url <url>', 'Custom RPC URL')
  .action(updateOracleCommand);

oracleCmd
  .command('show')
  .description('Display oracle information')
  .requiredOption('-o, --oracle <address>', 'Oracle account address')
  .option('-n, --network <network>', 'Network: devnet, mainnet-beta, or localnet (default: localnet)')
  .option('-u, --url <url>', 'Custom RPC URL')
  .action(showOracleCommand);

oracleCmd
  .command('crank')
  .description('Start oracle price updater crank (fetches from external APIs)')
  .requiredOption('-o, --oracle <address>', 'Oracle account address')
  .requiredOption('-i, --instrument <name>', 'Instrument name (e.g., BTC-PERP, ETH/USD)')
  .option('-n, --network <network>', 'Network: devnet or localnet (default: localnet)')
  .option('-k, --keypair <path>', 'Path to payer keypair file')
  .option('-a, --authority <path>', 'Path to authority keypair (defaults to payer)')
  .option('-u, --url <url>', 'Custom RPC URL')
  .option('--interval <ms>', 'Update interval in milliseconds (default: 5000)')
  .option('--source <source>', 'Price source: coingecko, binance, or coinbase (default: coingecko)')
  .action(oracleCrankCommand);

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
