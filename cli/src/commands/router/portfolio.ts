import { Connection, PublicKey } from '@solana/web3.js';
import { RouterClient, Cluster } from '@barista-dex/sdk';
import { loadKeypair, getConfig, getDefaultKeypairPath } from '../../utils/wallet';
import { displayError, formatAmount, formatPublicKey } from '../../utils/display';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';

interface PortfolioOptions {
  address?: string;
  keypair?: string;
  url?: string;
  network?: string;
}

export async function portfolioCommand(options: PortfolioOptions): Promise<void> {
  const spinner = ora('Loading configuration...').start();

  try {
    // Get cluster configuration (uses env vars if not provided)
    const cluster = options.network as Cluster | undefined;
    const config = getConfig(cluster, options.url);

    const keypairPath = options.keypair || getDefaultKeypairPath();
    const wallet = loadKeypair(keypairPath);

    // Connect to Solana
    const connection = new Connection(config.rpcUrl, 'confirmed');

    spinner.text = 'Connecting to Solana...';

    // Create RouterClient (read-only if only address is provided)
    const client = new RouterClient(
      connection,
      new PublicKey(config.routerProgramId)
    );

    // Determine user address
    const userAddress = options.address
      ? new PublicKey(options.address)
      : wallet.publicKey;

    spinner.text = `Fetching portfolio for ${formatPublicKey(userAddress.toBase58())}...`;

    // Get portfolio
    const portfolio = await client.getPortfolio(userAddress);

    if (!portfolio) {
      spinner.fail();
      displayError('Portfolio not found. The user may not have initialized their portfolio yet.');
      process.exit(1);
    }

    spinner.succeed('Portfolio loaded');

    // Display portfolio summary
    console.log(chalk.bold('\n📊 Portfolio Summary\n'));

    const summaryTable = new Table({
      head: ['Metric', 'Value'],
      colWidths: [25, 30],
    });

    summaryTable.push(
      ['Owner', formatPublicKey(portfolio.owner.toBase58())],
      ['Equity', formatAmount(portfolio.equity)],
      ['Collateral Value', formatAmount(portfolio.collateralValue)],
      ['Maint Margin', formatAmount(portfolio.maintMargin)],
      ['Unrealized PnL', formatAmount(portfolio.unrealizedPnl)],
      ['Health', formatAmount(portfolio.health)],
      ['Last Update', portfolio.lastUpdate.toString()]
    );

    console.log(summaryTable.toString());
  } catch (error: any) {
    spinner.fail();
    displayError(`Failed to fetch portfolio: ${error.message}`);
    process.exit(1);
  }
}
