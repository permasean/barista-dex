import { Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { loadKeypair, getConfig } from '../../utils/wallet';
import { Cluster } from '@barista-dex/sdk';

interface UpdateOracleOptions {
  network?: Cluster;
  url?: string;
  keypair?: string;
  authority?: string;
  oracle: string;
  price: string;
  confidence?: string;
}

/**
 * Update custom oracle price
 *
 * Usage:
 *   barista oracle update --oracle <ADDRESS> --price 51000
 */
export async function updateOracleCommand(options: UpdateOracleOptions) {
  try {
    console.log('Updating oracle price...\n');

    // Get configuration
    const config = getConfig(options.network, options.url);
    const connection = new Connection(config.rpcUrl, 'confirmed');

    // Load payer keypair
    const keypairPath = options.keypair || `${process.env.HOME}/.config/solana/id.json`;
    const payer = loadKeypair(keypairPath);
    console.log(`Payer: ${payer.publicKey.toBase58()}`);

    // Load authority (defaults to payer)
    const authority = options.authority
      ? loadKeypair(options.authority)
      : payer;
    console.log(`Authority: ${authority.publicKey.toBase58()}`);

    // Get oracle program ID
    const oracleProgramId = process.env.BARISTA_ORACLE_PROGRAM
      ? new PublicKey(process.env.BARISTA_ORACLE_PROGRAM)
      : new PublicKey('oracLEqeDFu8PPCKMn1djT5wEZyejxLJ8T4KbvdR9Ge');

    // Parse oracle address
    const oracleAddress = new PublicKey(options.oracle);
    console.log(`Oracle: ${oracleAddress.toBase58()}`);

    // Verify oracle account exists
    const oracleAccountInfo = await connection.getAccountInfo(oracleAddress);
    if (!oracleAccountInfo) {
      throw new Error(`Oracle account not found: ${oracleAddress.toBase58()}`);
    }
    if (!oracleAccountInfo.owner.equals(oracleProgramId)) {
      throw new Error(
        `Oracle account is not owned by oracle program. Owner: ${oracleAccountInfo.owner.toBase58()}`
      );
    }

    // Parse new price (convert to 1e6 scale)
    const priceFloat = parseFloat(options.price);
    if (isNaN(priceFloat) || priceFloat <= 0) {
      throw new Error(`Invalid price: ${options.price}`);
    }
    const priceScaled = BigInt(Math.floor(priceFloat * 1_000_000));

    // Parse confidence (default to 0.1% of price)
    const confidenceFloat = options.confidence
      ? parseFloat(options.confidence)
      : priceFloat * 0.001; // 0.1% default
    const confidenceScaled = BigInt(Math.floor(confidenceFloat * 1_000_000));

    console.log(`New Price: $${priceFloat.toLocaleString()} (${priceScaled} scaled)`);
    console.log(`Confidence: ±$${confidenceFloat.toFixed(2)} (${confidenceScaled} scaled)`);

    // Build update_price instruction
    // Data layout: discriminator (1) + price (8) + confidence (8) = 17 bytes
    const updateData = Buffer.alloc(17);
    updateData.writeUInt8(1, 0); // Discriminator = 1 (UpdatePrice)
    updateData.writeBigInt64LE(priceScaled, 1);
    updateData.writeBigInt64LE(confidenceScaled, 9);

    const updateIx = new TransactionInstruction({
      keys: [
        { pubkey: oracleAddress, isSigner: false, isWritable: true },
        { pubkey: authority.publicKey, isSigner: true, isWritable: false },
      ],
      programId: oracleProgramId,
      data: updateData,
    });

    // Build and send transaction
    const transaction = new Transaction().add(updateIx);

    console.log('\nSending transaction...');
    const signature = await connection.sendTransaction(
      transaction,
      [payer, authority],
      { skipPreflight: false }
    );

    console.log(`Transaction signature: ${signature}`);
    console.log('Confirming...');

    await connection.confirmTransaction(signature, 'confirmed');

    console.log('\n✅ Oracle price updated successfully!');
    console.log('\nUpdated Details:');
    console.log(`  Oracle: ${oracleAddress.toBase58()}`);
    console.log(`  New Price: $${priceFloat.toLocaleString()}`);
    console.log(`  Confidence: ±$${confidenceFloat.toFixed(2)}`);
    console.log(`  Timestamp: ${new Date().toISOString()}`);
  } catch (error) {
    console.error('\n❌ Error updating oracle:');
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}
