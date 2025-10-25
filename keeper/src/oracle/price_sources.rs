//! Price source integrations for oracle crank
//!
//! Fetches prices from external APIs:
//! - CoinGecko (free tier, wide coverage)
//! - Binance (real-time spot prices)
//! - Coinbase (institutional-grade pricing)

use anyhow::{Context, Result};
use serde::Deserialize;

/// Price source type
#[derive(Debug, Clone, Copy)]
pub enum PriceSource {
    CoinGecko,
    Binance,
    Coinbase,
}

impl PriceSource {
    pub fn from_str(s: &str) -> Result<Self> {
        match s.to_lowercase().as_str() {
            "coingecko" => Ok(Self::CoinGecko),
            "binance" => Ok(Self::Binance),
            "coinbase" => Ok(Self::Coinbase),
            _ => anyhow::bail!("Unknown price source: {}", s),
        }
    }
}

/// Fetch price from configured source
pub async fn fetch_price(instrument: &str, source: PriceSource) -> Result<f64> {
    match source {
        PriceSource::CoinGecko => fetch_from_coingecko(instrument).await,
        PriceSource::Binance => fetch_from_binance(instrument).await,
        PriceSource::Coinbase => fetch_from_coinbase(instrument).await,
    }
}

// ============================================================================
// CoinGecko
// ============================================================================

#[derive(Deserialize)]
struct CoinGeckoResponse {
    #[serde(flatten)]
    prices: std::collections::HashMap<String, CoinGeckoPrice>,
}

#[derive(Deserialize)]
struct CoinGeckoPrice {
    usd: f64,
}

async fn fetch_from_coingecko(instrument: &str) -> Result<f64> {
    // Map instrument names to CoinGecko IDs
    let base_symbol = instrument.split(&['-', '/'][..]).next()
        .unwrap_or(instrument);

    let coin_id = match base_symbol {
        "BTC" => "bitcoin",
        "ETH" => "ethereum",
        "SOL" => "solana",
        "USDC" => "usd-coin",
        "USDT" => "tether",
        _ => base_symbol,
    };

    let url = format!(
        "https://api.coingecko.com/api/v3/simple/price?ids={}&vs_currencies=usd",
        coin_id
    );

    let response = reqwest::get(&url)
        .await
        .context("Failed to fetch from CoinGecko")?;

    if !response.status().is_success() {
        anyhow::bail!("CoinGecko API error: {}", response.status());
    }

    let data: CoinGeckoResponse = response
        .json()
        .await
        .context("Failed to parse CoinGecko response")?;

    let price = data
        .prices
        .get(coin_id)
        .context(format!("Price not found for {}", coin_id))?
        .usd;

    Ok(price)
}

// ============================================================================
// Binance
// ============================================================================

#[derive(Deserialize)]
struct BinanceResponse {
    price: String,
}

async fn fetch_from_binance(instrument: &str) -> Result<f64> {
    let base_symbol = instrument.split(&['-', '/'][..]).next()
        .context("Invalid instrument format")?;
    let trading_pair = format!("{}USDT", base_symbol.to_uppercase());

    let url = format!(
        "https://api.binance.com/api/v3/ticker/price?symbol={}",
        trading_pair
    );

    let response = reqwest::get(&url)
        .await
        .context("Failed to fetch from Binance")?;

    if !response.status().is_success() {
        anyhow::bail!("Binance API error: {}", response.status());
    }

    let data: BinanceResponse = response
        .json()
        .await
        .context("Failed to parse Binance response")?;

    let price: f64 = data.price.parse()
        .context("Failed to parse Binance price")?;

    Ok(price)
}

// ============================================================================
// Coinbase
// ============================================================================

#[derive(Deserialize)]
struct CoinbaseResponse {
    data: CoinbaseData,
}

#[derive(Deserialize)]
struct CoinbaseData {
    amount: String,
}

async fn fetch_from_coinbase(instrument: &str) -> Result<f64> {
    let base_symbol = instrument.split(&['-', '/'][..]).next()
        .context("Invalid instrument format")?;
    let trading_pair = format!("{}-USD", base_symbol.to_uppercase());

    let url = format!(
        "https://api.coinbase.com/v2/prices/{}/spot",
        trading_pair
    );

    let response = reqwest::get(&url)
        .await
        .context("Failed to fetch from Coinbase")?;

    if !response.status().is_success() {
        anyhow::bail!("Coinbase API error: {}", response.status());
    }

    let data: CoinbaseResponse = response
        .json()
        .await
        .context("Failed to parse Coinbase response")?;

    let price: f64 = data.data.amount.parse()
        .context("Failed to parse Coinbase price")?;

    Ok(price)
}
