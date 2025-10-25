//! Percolator Keeper
//!
//! Off-chain services for Percolator DEX:
//! - Liquidation bot (monitors portfolio health, triggers liquidations)
//! - Oracle management (init, update, crank for custom oracles)

mod cli;
mod config;
mod health;
mod oracle;
mod priority_queue;
mod tx_builder;

use anyhow::{Context, Result};
use clap::Parser;
use cli::{Cli, Commands, OracleCommands};
use config::Config;
use priority_queue::{HealthQueue, UserHealth};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    commitment_config::CommitmentConfig,
    pubkey::Pubkey,
    signature::{Keypair, Signer},
};
use std::time::Duration;
use tokio::time;

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize logging
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    // Parse CLI arguments
    let cli = Cli::parse();

    match cli.command {
        Commands::Liquidate { config: config_path } => {
            run_liquidation_keeper(&config_path).await
        }
        Commands::Oracle { subcommand } => {
            run_oracle_command(subcommand).await
        }
    }
}

/// Run liquidation keeper service
async fn run_liquidation_keeper(config_path: &str) -> Result<()> {
    log::info!("Starting Percolator Liquidation Keeper");

    // Load configuration
    let config = Config::load_from(config_path).unwrap_or_else(|_| {
        log::warn!("Failed to load config from {}, using default devnet config", config_path);
        Config::default_devnet()
    });

    log::info!("Connected to RPC: {}", config.rpc_url);
    log::info!("Monitoring router program: {}", config.router_program);

    // Initialize RPC client
    let client = RpcClient::new_with_commitment(
        config.rpc_url.clone(),
        CommitmentConfig::confirmed(),
    );

    // Load keeper wallet
    let keeper = load_keypair(&config.keypair_path)?;
    log::info!("Keeper wallet: {}", keeper.pubkey());

    // Initialize health queue
    let mut queue = HealthQueue::new();

    log::info!("Keeper service started. Monitoring for liquidations...");

    // Main event loop
    let mut interval = time::interval(Duration::from_secs(config.poll_interval_secs));

    loop {
        interval.tick().await;

        // Process liquidations
        if let Err(e) = process_liquidations(&mut queue, &client, &config, &keeper).await {
            log::error!("Error processing liquidations: {}", e);
        }

        // Log queue status
        if !queue.is_empty() {
            log::debug!("Health queue size: {}", queue.len());

            if let Some(worst) = queue.peek() {
                log::debug!("Worst health: {}", worst.health as f64 / 1e6);
            }
        }
    }
}

/// Process liquidations for users in the queue
async fn process_liquidations(
    queue: &mut HealthQueue,
    client: &RpcClient,
    config: &Config,
    keeper: &Keypair,
) -> Result<()> {
    // Get liquidatable users
    let liquidatable = queue.get_liquidatable(config.liquidation_threshold);

    if liquidatable.is_empty() {
        log::debug!("No users need liquidation");
        return Ok(());
    }

    log::info!("Found {} users needing liquidation", liquidatable.len());

    // Process up to max batch size
    let batch_size = config.max_liquidations_per_batch.min(liquidatable.len());

    for user_health in liquidatable.iter().take(batch_size) {
        log::info!(
            "Liquidating user {} (health: {})",
            user_health.user,
            user_health.health as f64 / 1e6
        );

        // Determine if pre-liquidation or hard liquidation
        let is_preliq = user_health.health > 0 && user_health.health < config.preliq_buffer;

        // Build and submit liquidation transaction
        match execute_liquidation(
            client,
            config,
            keeper,
            &user_health.portfolio,
            is_preliq,
        ) {
            Ok(signature) => {
                log::info!("Liquidation submitted: {}", signature);

                // Remove from queue
                queue.remove(&user_health.user);
            }
            Err(e) => {
                log::error!(
                    "Failed to liquidate user {}: {}",
                    user_health.user,
                    e
                );
            }
        }
    }

    Ok(())
}

/// Execute a single liquidation
fn execute_liquidation(
    client: &RpcClient,
    config: &Config,
    keeper: &Keypair,
    portfolio: &Pubkey,
    is_preliq: bool,
) -> Result<String> {
    // For v0, this is a stub
    // In production, this would:
    // 1. Fetch recent blockhash
    // 2. Get registry and vault addresses
    // 3. Build liquidation transaction
    // 4. Submit to cluster
    // 5. Wait for confirmation

    log::debug!(
        "Would execute {} liquidation for portfolio {}",
        if is_preliq { "pre" } else { "hard" },
        portfolio
    );

    // Stub: return fake signature
    Ok("stub_signature".to_string())
}

/// Load keeper keypair from file
fn load_keypair(path: &str) -> Result<Keypair> {
    let expanded_path = shellexpand::tilde(path);
    let bytes = std::fs::read(expanded_path.as_ref())
        .context(format!("Failed to read keypair from {}", path))?;

    let keypair = if bytes[0] == b'[' {
        // JSON format
        let json_data: Vec<u8> = serde_json::from_slice(&bytes)
            .context("Failed to parse keypair JSON")?;
        Keypair::try_from(&json_data[..])
            .context("Failed to create keypair from bytes")?
    } else {
        // Binary format
        Keypair::try_from(&bytes[..])
            .context("Failed to create keypair from bytes")?
    };

    Ok(keypair)
}

/// Fetch portfolio accounts and update health queue (stub for v0)
#[allow(dead_code)]
async fn update_health_queue(
    queue: &mut HealthQueue,
    client: &RpcClient,
    _config: &Config,
) -> Result<()> {
    // For v0, this is a stub
    // In production, this would:
    // 1. Query all portfolio accounts via getProgramAccounts
    // 2. Fetch oracle prices
    // 3. Calculate health for each portfolio
    // 4. Update queue

    log::debug!("Health queue update (stub)");

    // Example: add a dummy user for testing
    let dummy_user = UserHealth {
        user: Pubkey::new_unique(),
        portfolio: Pubkey::new_unique(),
        health: -5_000_000, // Below MM
        equity: 95_000_000,
        mm: 100_000_000,
        last_update: 0,
    };

    queue.push(dummy_user);

    Ok(())
}

/// Run oracle management command
async fn run_oracle_command(subcommand: OracleCommands) -> Result<()> {
    match subcommand {
        OracleCommands::Init {
            instrument,
            price,
            rpc_url,
            keypair,
            authority,
            oracle_program,
        } => {
            let client = RpcClient::new_with_commitment(rpc_url, CommitmentConfig::confirmed());

            let keypair_path = keypair.unwrap_or_else(|| {
                format!("{}/.config/solana/id.json", std::env::var("HOME").unwrap())
            });
            let payer = load_keypair(&keypair_path)?;

            let authority_kp = if let Some(auth_path) = authority {
                load_keypair(&auth_path)?
            } else {
                load_keypair(&keypair_path)?
            };

            let oracle_program_id = oracle_program
                .map(|s| s.parse::<Pubkey>())
                .transpose()
                .context("Invalid oracle program ID")?
                .unwrap_or_else(|| {
                    "oracLEqeDFu8PPCKMn1djT5wEZyejxLJ8T4KbvdR9Ge".parse().unwrap()
                });

            let oracle_address = oracle::commands::init_oracle(
                &client,
                &payer,
                &authority_kp,
                &oracle_program_id,
                &instrument,
                price,
            )?;

            println!("\n💡 Tip: Set environment variable for future commands:");
            println!("  export PERCOLATOR_ORACLE={}", oracle_address);

            Ok(())
        }

        OracleCommands::Update {
            oracle,
            price,
            confidence,
            rpc_url,
            keypair,
            authority,
            oracle_program,
        } => {
            let client = RpcClient::new_with_commitment(rpc_url, CommitmentConfig::confirmed());

            let keypair_path = keypair.unwrap_or_else(|| {
                format!("{}/.config/solana/id.json", std::env::var("HOME").unwrap())
            });
            let payer = load_keypair(&keypair_path)?;

            let authority_kp = if let Some(auth_path) = authority {
                load_keypair(&auth_path)?
            } else {
                load_keypair(&keypair_path)?
            };

            let oracle_program_id = oracle_program
                .map(|s| s.parse::<Pubkey>())
                .transpose()
                .context("Invalid oracle program ID")?
                .unwrap_or_else(|| {
                    "oracLEqeDFu8PPCKMn1djT5wEZyejxLJ8T4KbvdR9Ge".parse().unwrap()
                });

            let oracle_address = oracle.parse::<Pubkey>()
                .context("Invalid oracle address")?;

            oracle::commands::update_oracle(
                &client,
                &payer,
                &authority_kp,
                &oracle_program_id,
                &oracle_address,
                price,
                confidence,
            )?;

            Ok(())
        }

        OracleCommands::Show { oracle, rpc_url } => {
            let client = RpcClient::new_with_commitment(rpc_url, CommitmentConfig::confirmed());

            let oracle_address = oracle.parse::<Pubkey>()
                .context("Invalid oracle address")?;

            oracle::commands::show_oracle(&client, &oracle_address)?;

            Ok(())
        }

        OracleCommands::Crank {
            oracle,
            instrument,
            interval,
            source,
            rpc_url,
            keypair,
            authority,
            oracle_program,
        } => {
            let client = RpcClient::new_with_commitment(rpc_url.clone(), CommitmentConfig::confirmed());

            let keypair_path = keypair.unwrap_or_else(|| {
                format!("{}/.config/solana/id.json", std::env::var("HOME").unwrap())
            });
            let payer = load_keypair(&keypair_path)?;

            let authority_kp = if let Some(auth_path) = authority {
                load_keypair(&auth_path)?
            } else {
                load_keypair(&keypair_path)?
            };

            let oracle_program_id = oracle_program
                .map(|s| s.parse::<Pubkey>())
                .transpose()
                .context("Invalid oracle program ID")?
                .unwrap_or_else(|| {
                    "oracLEqeDFu8PPCKMn1djT5wEZyejxLJ8T4KbvdR9Ge".parse().unwrap()
                });

            let oracle_address = oracle.parse::<Pubkey>()
                .context("Invalid oracle address")?;

            let price_source = oracle::price_sources::PriceSource::from_str(&source)?;

            println!("═══════════════════════════════════════════════════");
            println!("            ORACLE CRANK SERVICE");
            println!("═══════════════════════════════════════════════════\n");
            println!("🔧 Configuration:");
            println!("  Oracle:         {}", oracle_address);
            println!("  Instrument:     {}", instrument);
            println!("  RPC:            {}", rpc_url);
            println!("  Price Source:   {:?}", price_source);
            println!("  Update Interval: {}s", interval);
            println!("\n🚀 Starting crank service...");
            println!("   Press Ctrl+C to stop\n");

            // Run initial update
            let price = oracle::price_sources::fetch_price(&instrument, price_source).await?;
            log::info!("Fetched {}: ${:.2}", instrument, price);

            oracle::commands::update_oracle(
                &client,
                &payer,
                &authority_kp,
                &oracle_program_id,
                &oracle_address,
                price,
                None,
            )?;

            // Schedule periodic updates
            let mut interval_timer = time::interval(Duration::from_secs(interval));

            loop {
                interval_timer.tick().await;

                match oracle::price_sources::fetch_price(&instrument, price_source).await {
                    Ok(price) => {
                        log::info!("Fetched {}: ${:.2}", instrument, price);

                        if let Err(e) = oracle::commands::update_oracle(
                            &client,
                            &payer,
                            &authority_kp,
                            &oracle_program_id,
                            &oracle_address,
                            price,
                            None,
                        ) {
                            log::error!("Failed to update oracle: {}", e);
                        }
                    }
                    Err(e) => {
                        log::error!("Failed to fetch price: {}", e);
                    }
                }
            }
        }
    }
}
