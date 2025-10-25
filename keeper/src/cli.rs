//! CLI interface for keeper commands

use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "percolator-keeper")]
#[command(about = "Percolator DEX keeper services", long_about = None)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand)]
pub enum Commands {
    /// Run liquidation bot
    Liquidate {
        /// Path to config file
        #[arg(short, long, default_value = "keeper.toml")]
        config: String,
    },

    /// Oracle management commands
    Oracle {
        #[command(subcommand)]
        subcommand: OracleCommands,
    },
}

#[derive(Subcommand)]
pub enum OracleCommands {
    /// Initialize a new oracle
    Init {
        /// Instrument name (e.g., BTC-PERP, ETH/USD)
        #[arg(short, long)]
        instrument: String,

        /// Initial price
        #[arg(short, long)]
        price: f64,

        /// RPC URL
        #[arg(short, long, default_value = "http://localhost:8899")]
        rpc_url: String,

        /// Keypair path (payer)
        #[arg(short, long)]
        keypair: Option<String>,

        /// Authority keypair (defaults to payer)
        #[arg(short, long)]
        authority: Option<String>,

        /// Oracle program ID
        #[arg(long)]
        oracle_program: Option<String>,
    },

    /// Update oracle price
    Update {
        /// Oracle account address
        #[arg(short, long)]
        oracle: String,

        /// New price
        #[arg(short, long)]
        price: f64,

        /// Confidence interval (±amount, defaults to 0.1% of price)
        #[arg(short, long)]
        confidence: Option<f64>,

        /// RPC URL
        #[arg(short, long, default_value = "http://localhost:8899")]
        rpc_url: String,

        /// Keypair path (payer)
        #[arg(short, long)]
        keypair: Option<String>,

        /// Authority keypair (defaults to payer)
        #[arg(short, long)]
        authority: Option<String>,

        /// Oracle program ID
        #[arg(long)]
        oracle_program: Option<String>,
    },

    /// Show oracle information
    Show {
        /// Oracle account address
        #[arg(short, long)]
        oracle: String,

        /// RPC URL
        #[arg(short, long, default_value = "http://localhost:8899")]
        rpc_url: String,
    },

    /// Run oracle price updater crank
    Crank {
        /// Oracle account address
        #[arg(short, long)]
        oracle: String,

        /// Instrument name (e.g., BTC-PERP, ETH/USD)
        #[arg(short, long)]
        instrument: String,

        /// Update interval in seconds
        #[arg(long, default_value = "5")]
        interval: u64,

        /// Price source (coingecko, binance, coinbase)
        #[arg(short, long, default_value = "coingecko")]
        source: String,

        /// RPC URL
        #[arg(short, long, default_value = "http://localhost:8899")]
        rpc_url: String,

        /// Keypair path (payer)
        #[arg(short, long)]
        keypair: Option<String>,

        /// Authority keypair (defaults to payer)
        #[arg(short, long)]
        authority: Option<String>,

        /// Oracle program ID
        #[arg(long)]
        oracle_program: Option<String>,
    },
}
