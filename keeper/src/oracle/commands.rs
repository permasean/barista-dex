//! Oracle CLI commands

use super::PriceOracle;
use anyhow::{Context, Result};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    system_instruction,
    transaction::Transaction,
};

/// Initialize a new oracle account
pub fn init_oracle(
    client: &RpcClient,
    payer: &Keypair,
    authority: &Keypair,
    oracle_program_id: &Pubkey,
    instrument_name: &str,
    initial_price: f64,
) -> Result<Pubkey> {
    log::info!("Initializing oracle for instrument: {}", instrument_name);

    // Create oracle account keypair
    let oracle = Keypair::new();
    log::info!("Oracle address: {}", oracle.pubkey());

    // Create instrument PDA (deterministic from name)
    let instrument_seed = format!("{:\0<32}", instrument_name);
    let (instrument_pubkey, _) = Pubkey::find_program_address(
        &[b"instrument", instrument_seed.as_bytes()],
        oracle_program_id,
    );
    log::info!("Instrument: {} ({})", instrument_name, instrument_pubkey);

    // Convert price to 1e6 scale
    let price_scaled = (initial_price * 1_000_000.0) as i64;
    log::info!("Initial price: ${:.2} ({} scaled)", initial_price, price_scaled);

    // Get minimum balance for rent exemption
    let lamports = client
        .get_minimum_balance_for_rent_exemption(PriceOracle::SIZE)
        .context("Failed to get rent exemption")?;

    // Build create account instruction
    let create_account_ix = system_instruction::create_account(
        &payer.pubkey(),
        &oracle.pubkey(),
        lamports,
        PriceOracle::SIZE as u64,
        oracle_program_id,
    );

    // Build initialize instruction
    // Data: discriminator (1) + price (8) + bump (1) = 10 bytes
    let mut init_data = vec![0u8; 10];
    init_data[0] = 0; // Initialize discriminator
    init_data[1..9].copy_from_slice(&price_scaled.to_le_bytes());
    init_data[9] = 255; // Bump (255 for non-PDA)

    let init_ix = Instruction::new_with_bytes(
        *oracle_program_id,
        &init_data,
        vec![
            AccountMeta::new(oracle.pubkey(), false),
            AccountMeta::new_readonly(authority.pubkey(), true),
            AccountMeta::new_readonly(instrument_pubkey, false),
        ],
    );

    // Build and send transaction
    let recent_blockhash = client.get_latest_blockhash()?;
    let transaction = Transaction::new_signed_with_payer(
        &[create_account_ix, init_ix],
        Some(&payer.pubkey()),
        &[payer, &oracle, authority],
        recent_blockhash,
    );

    let signature = client
        .send_and_confirm_transaction_with_spinner(&transaction)
        .context("Failed to send transaction")?;

    log::info!("✅ Oracle initialized successfully!");
    log::info!("Transaction: {}", signature);

    Ok(oracle.pubkey())
}

/// Update oracle price
pub fn update_oracle(
    client: &RpcClient,
    payer: &Keypair,
    authority: &Keypair,
    oracle_program_id: &Pubkey,
    oracle_address: &Pubkey,
    new_price: f64,
    confidence_opt: Option<f64>,
) -> Result<()> {
    log::info!("Updating oracle: {}", oracle_address);

    // Verify oracle account exists and is owned by oracle program
    let account = client
        .get_account(oracle_address)
        .context("Oracle account not found")?;

    if account.owner != *oracle_program_id {
        anyhow::bail!(
            "Oracle account is not owned by oracle program. Owner: {}",
            account.owner
        );
    }

    // Convert price to 1e6 scale
    let price_scaled = (new_price * 1_000_000.0) as i64;

    // Default confidence to 0.1% of price
    let confidence = confidence_opt.unwrap_or(new_price * 0.001);
    let confidence_scaled = (confidence * 1_000_000.0) as i64;

    log::info!("New price: ${:.2} ({} scaled)", new_price, price_scaled);
    log::info!("Confidence: ±${:.2} ({} scaled)", confidence, confidence_scaled);

    // Build update instruction
    // Data: discriminator (1) + price (8) + confidence (8) = 17 bytes
    let mut update_data = vec![0u8; 17];
    update_data[0] = 1; // UpdatePrice discriminator
    update_data[1..9].copy_from_slice(&price_scaled.to_le_bytes());
    update_data[9..17].copy_from_slice(&confidence_scaled.to_le_bytes());

    let update_ix = Instruction::new_with_bytes(
        *oracle_program_id,
        &update_data,
        vec![
            AccountMeta::new(*oracle_address, false),
            AccountMeta::new_readonly(authority.pubkey(), true),
        ],
    );

    // Build and send transaction
    let recent_blockhash = client.get_latest_blockhash()?;
    let transaction = Transaction::new_signed_with_payer(
        &[update_ix],
        Some(&payer.pubkey()),
        &[payer, authority],
        recent_blockhash,
    );

    let signature = client
        .send_and_confirm_transaction_with_spinner(&transaction)
        .context("Failed to send transaction")?;

    log::info!("✅ Oracle updated successfully!");
    log::info!("Transaction: {}", signature);

    Ok(())
}

/// Display oracle information
pub fn show_oracle(
    client: &RpcClient,
    oracle_address: &Pubkey,
) -> Result<()> {
    log::info!("Fetching oracle: {}", oracle_address);

    // Fetch oracle account
    let account = client
        .get_account(oracle_address)
        .context("Oracle account not found")?;

    // Parse oracle data
    let oracle = PriceOracle::from_bytes(&account.data)?;

    // Display information
    println!("\n═══════════════════════════════════════════════════");
    println!("              ORACLE INFORMATION");
    println!("═══════════════════════════════════════════════════\n");

    println!("🔧 Metadata");
    println!("  Magic:       {}", String::from_utf8_lossy(&oracle.magic));
    println!("  Version:     {}", oracle.version);
    println!("  Bump:        {}", oracle.bump);
    println!();

    println!("🔑 Accounts");
    println!("  Authority:   {}", oracle.authority);
    println!("  Instrument:  {}", oracle.instrument);
    println!();

    println!("💰 Price Data");
    println!("  Price:       ${:.6}", oracle.price_f64());
    println!("  Confidence:  ±${:.6}", oracle.confidence_f64());

    if oracle.timestamp > 0 {
        let timestamp = oracle.timestamp as u64;
        let datetime = chrono::DateTime::from_timestamp(timestamp as i64, 0)
            .unwrap_or_default();
        println!("  Timestamp:   {}", datetime.format("%Y-%m-%d %H:%M:%S UTC"));

        // Calculate age
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let age_secs = now - timestamp;

        if age_secs < 60 {
            println!("  Age:         {}s ago", age_secs);
        } else if age_secs < 3600 {
            println!("  Age:         {}m {}s ago", age_secs / 60, age_secs % 60);
        } else {
            println!("  Age:         {}h {}m ago", age_secs / 3600, (age_secs % 3600) / 60);
        }

        // Staleness warning
        if oracle.is_stale(60) {
            println!("  ⚠️  WARNING: Price is stale (> 60 seconds old)");
        }
    } else {
        println!("  Timestamp:   Not set");
    }

    println!();
    println!("═══════════════════════════════════════════════════\n");

    Ok(())
}
