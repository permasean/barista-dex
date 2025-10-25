import { Connection, PublicKey } from '@solana/web3.js';
import { getConfig } from '../../utils/wallet';
import { Cluster } from '@barista-dex/sdk';

interface ShowOracleOptions {
  network?: Cluster;
  url?: string;
  oracle: string;
}

/**
 * Display oracle information (price, timestamp, confidence)
 *
 * Usage:
 *   barista oracle show --oracle <ADDRESS>
 */
export async function showOracleCommand(options: ShowOracleOptions) {
  try {
    console.log('Fetching oracle data...\n');

    // Get configuration
    const config = getConfig(options.network, options.url);
    const connection = new Connection(config.rpcUrl, 'confirmed');

    // Parse oracle address
    const oracleAddress = new PublicKey(options.oracle);
    console.log(`Oracle: ${oracleAddress.toBase58()}\n`);

    // Fetch oracle account
    const oracleAccountInfo = await connection.getAccountInfo(oracleAddress);
    if (!oracleAccountInfo) {
      throw new Error(`Oracle account not found: ${oracleAddress.toBase58()}`);
    }

    const data = oracleAccountInfo.data;
    if (data.length < 128) {
      throw new Error(`Invalid oracle account size: ${data.length} bytes (expected 128)`);
    }

    // Parse oracle structure (see programs/oracle/src/state.rs)
    // Magic: u64 (offset 0)
    const magicBytes = data.slice(0, 8);
    const magic = Buffer.from(magicBytes).toString('ascii').replace(/\0/g, '');

    // Version: u8 (offset 8)
    const version = data.readUInt8(8);

    // Bump: u8 (offset 9)
    const bump = data.readUInt8(9);

    // Authority: Pubkey (offset 16, after padding)
    const authorityBytes = data.slice(16, 48);
    const authority = new PublicKey(authorityBytes);

    // Instrument: Pubkey (offset 48)
    const instrumentBytes = data.slice(48, 80);
    const instrument = new PublicKey(instrumentBytes);

    // Price: i64 (offset 72) - Note: Overlaps due to struct layout, use correct offset
    // Actually at offset 80 after authority + instrument
    const priceRaw = data.readBigInt64LE(80);
    const price = Number(priceRaw) / 1_000_000; // Convert from 1e6 scale

    // Timestamp: i64 (offset 88)
    const timestampRaw = data.readBigInt64LE(88);
    const timestamp = Number(timestampRaw);
    const timestampDate = timestamp > 0 ? new Date(timestamp * 1000) : null;

    // Confidence: i64 (offset 96)
    const confidenceRaw = data.readBigInt64LE(96);
    const confidence = Number(confidenceRaw) / 1_000_000;

    // Display oracle information
    console.log('═══════════════════════════════════════════════════');
    console.log('                  ORACLE INFORMATION               ');
    console.log('═══════════════════════════════════════════════════');
    console.log();
    console.log(`🔧 Metadata`);
    console.log(`  Magic:       ${magic}`);
    console.log(`  Version:     ${version}`);
    console.log(`  Bump:        ${bump}`);
    console.log();
    console.log(`🔑 Accounts`);
    console.log(`  Authority:   ${authority.toBase58()}`);
    console.log(`  Instrument:  ${instrument.toBase58()}`);
    console.log();
    console.log(`💰 Price Data`);
    console.log(`  Price:       $${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`);
    console.log(`  Confidence:  ±$${confidence.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`);
    console.log(`  Timestamp:   ${timestampDate ? timestampDate.toISOString() : 'Not set'}`);
    if (timestampDate) {
      const ageSeconds = Math.floor((Date.now() - timestampDate.getTime()) / 1000);
      const ageMinutes = Math.floor(ageSeconds / 60);
      const ageHours = Math.floor(ageMinutes / 60);

      let ageDisplay = '';
      if (ageHours > 0) {
        ageDisplay = `${ageHours}h ${ageMinutes % 60}m ago`;
      } else if (ageMinutes > 0) {
        ageDisplay = `${ageMinutes}m ${ageSeconds % 60}s ago`;
      } else {
        ageDisplay = `${ageSeconds}s ago`;
      }

      console.log(`  Age:         ${ageDisplay}`);

      // Staleness warning
      if (ageSeconds > 60) {
        console.log(`  ⚠️  WARNING: Price is stale (> 60 seconds old)`);
      }
    }
    console.log();
    console.log('═══════════════════════════════════════════════════');
  } catch (error) {
    console.error('\n❌ Error fetching oracle data:');
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}
