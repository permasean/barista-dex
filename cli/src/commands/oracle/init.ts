import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { loadKeypair, getConfig } from '../../utils/wallet';
import { Cluster } from '@barista-dex/sdk';

interface InitOracleOptions {
  network?: Cluster;
  url?: string;
  keypair?: string;
  authority?: string;
  instrument: string;
  price: string;
}

/**
 * Initialize a custom oracle for localnet/devnet testing
 *
 * Usage:
 *   barista oracle init --instrument BTC-PERP --price 50000
 */
export async function initOracleCommand(options: InitOracleOptions) {
  try {
    console.log('Initializing custom oracle...\n');

    // Get configuration
    const config = getConfig(options.network, options.url);
    const connection = new Connection(config.rpcUrl, 'confirmed');

    // Load payer keypair
    const keypairPath = options.keypair || `${process.env.HOME}/.config/solana/id.json`;
    const payer = loadKeypair(keypairPath);
    console.log(`Payer: ${payer.publicKey.toBase58()}`);

    // Load or default authority
    const authority = options.authority
      ? loadKeypair(options.authority)
      : payer; // Default to payer as authority
    console.log(`Authority: ${authority.publicKey.toBase58()}`);

    // Get oracle program ID from environment or use default
    const oracleProgramId = process.env.BARISTA_ORACLE_PROGRAM
      ? new PublicKey(process.env.BARISTA_ORACLE_PROGRAM)
      : new PublicKey('oracLEqeDFu8PPCKMn1djT5wEZyejxLJ8T4KbvdR9Ge'); // TODO: Replace with actual deployed ID

    console.log(`Oracle Program: ${oracleProgramId.toBase58()}`);

    // Parse price (convert to 1e6 scale)
    const priceFloat = parseFloat(options.price);
    if (isNaN(priceFloat) || priceFloat <= 0) {
      throw new Error(`Invalid price: ${options.price}`);
    }
    const priceScaled = BigInt(Math.floor(priceFloat * 1_000_000));
    console.log(`Initial Price: $${priceFloat.toLocaleString()} (${priceScaled} scaled)`);

    // Create instrument pubkey (hash of instrument name for consistency)
    const instrumentName = options.instrument;
    const instrumentSeed = Buffer.from(instrumentName.padEnd(32, '\0').slice(0, 32));
    const [instrumentPubkey] = PublicKey.findProgramAddressSync(
      [Buffer.from('instrument'), instrumentSeed],
      oracleProgramId
    );
    console.log(`Instrument: ${instrumentName} (${instrumentPubkey.toBase58()})`);

    // Create oracle account keypair
    const oracleAccount = Keypair.generate();
    console.log(`Oracle Account: ${oracleAccount.publicKey.toBase58()}`);

    // Get minimum balance for rent exemption (128 bytes)
    const ORACLE_ACCOUNT_SIZE = 128;
    const lamports = await connection.getMinimumBalanceForRentExemption(ORACLE_ACCOUNT_SIZE);

    // Build create account instruction
    const createAccountIx = SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: oracleAccount.publicKey,
      lamports,
      space: ORACLE_ACCOUNT_SIZE,
      programId: oracleProgramId,
    });

    // Build initialize oracle instruction
    // Data layout: discriminator (1) + initial_price (8) + bump (1) = 10 bytes
    const initData = Buffer.alloc(10);
    initData.writeUInt8(0, 0); // Discriminator = 0 (Initialize)
    initData.writeBigInt64LE(priceScaled, 1);
    initData.writeUInt8(255, 9); // Bump (255 for non-PDA accounts)

    const initializeIx = new TransactionInstruction({
      keys: [
        { pubkey: oracleAccount.publicKey, isSigner: false, isWritable: true },
        { pubkey: authority.publicKey, isSigner: true, isWritable: false },
        { pubkey: instrumentPubkey, isSigner: false, isWritable: false },
      ],
      programId: oracleProgramId,
      data: initData,
    });

    // Build and send transaction
    const transaction = new Transaction().add(createAccountIx, initializeIx);

    console.log('\nSending transaction...');
    const signature = await connection.sendTransaction(
      transaction,
      [payer, oracleAccount, authority],
      { skipPreflight: false }
    );

    console.log(`Transaction signature: ${signature}`);
    console.log('Confirming...');

    await connection.confirmTransaction(signature, 'confirmed');

    console.log('\n✅ Oracle initialized successfully!');
    console.log('\nOracle Details:');
    console.log(`  Address: ${oracleAccount.publicKey.toBase58()}`);
    console.log(`  Instrument: ${instrumentName}`);
    console.log(`  Initial Price: $${priceFloat.toLocaleString()}`);
    console.log(`  Authority: ${authority.publicKey.toBase58()}`);
    console.log('\nTo update the price:');
    console.log(`  barista oracle update --oracle ${oracleAccount.publicKey.toBase58()} --price <new_price>`);

    // Save oracle address to config file for easy reference
    console.log('\n💡 Tip: Set BARISTA_ORACLE environment variable for future commands:');
    console.log(`  export BARISTA_ORACLE=${oracleAccount.publicKey.toBase58()}`);
  } catch (error) {
    console.error('\n❌ Error initializing oracle:');
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}
