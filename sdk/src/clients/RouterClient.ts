import {
  Connection,
  PublicKey,
  TransactionInstruction,
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import BN from 'bn.js';
import {
  RouterInstruction,
  Portfolio,
  Registry,
  Vault,
  SlabSplit,
  LiquidationParams,
  BurnLpSharesParams,
  CancelLpOrdersParams,
} from '../types/router';
import {
  serializeU64,
  serializeU128,
  serializeI64,
  serializeBool,
  serializePubkey,
  createInstructionData,
  deserializeU128,
  deserializeI64,
  deserializePubkey,
} from '../utils/serialization';

/**
 * Client for interacting with the Barista DEX Router program
 */
export class RouterClient {
  /**
   * Create a new RouterClient
   * @param connection Solana connection
   * @param programId Router program ID
   * @param wallet Optional wallet keypair for signing transactions
   */
  constructor(
    private connection: Connection,
    private programId: PublicKey,
    private wallet?: Keypair
  ) {}

  // ============================================================================
  // PDA Derivation Methods
  // ============================================================================

  /**
   * Derive Portfolio PDA for a user
   * @param user User's public key
   * @returns [PDA, bump]
   */
  derivePortfolioPDA(user: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('portfolio'), user.toBuffer()],
      this.programId
    );
  }

  /**
   * Derive Vault PDA for a token mint
   * @param mint Token mint public key
   * @returns [PDA, bump]
   */
  deriveVaultPDA(mint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), mint.toBuffer()],
      this.programId
    );
  }

  /**
   * Derive Registry PDA
   * @returns [PDA, bump]
   */
  deriveRegistryPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('registry')],
      this.programId
    );
  }

  /**
   * Derive Authority PDA
   * @returns [PDA, bump]
   */
  deriveAuthorityPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('authority')],
      this.programId
    );
  }

  // ============================================================================
  // Account Fetching Methods
  // ============================================================================

  /**
   * Fetch Portfolio account data
   * @param user User's public key
   * @returns Portfolio data
   */
  async getPortfolio(user: PublicKey): Promise<Portfolio | null> {
    const [portfolioPDA] = this.derivePortfolioPDA(user);
    const accountInfo = await this.connection.getAccountInfo(portfolioPDA);

    if (!accountInfo) {
      return null;
    }

    return this.deserializePortfolio(accountInfo.data);
  }

  /**
   * Fetch Registry account data
   * @returns Registry data
   */
  async getRegistry(): Promise<Registry | null> {
    const [registryPDA] = this.deriveRegistryPDA();
    const accountInfo = await this.connection.getAccountInfo(registryPDA);

    if (!accountInfo) {
      return null;
    }

    return this.deserializeRegistry(accountInfo.data);
  }

  /**
   * Fetch Vault account data
   * @param mint Token mint public key
   * @returns Vault data
   */
  async getVault(mint: PublicKey): Promise<Vault | null> {
    const [vaultPDA] = this.deriveVaultPDA(mint);
    const accountInfo = await this.connection.getAccountInfo(vaultPDA);

    if (!accountInfo) {
      return null;
    }

    return this.deserializeVault(accountInfo.data);
  }

  // ============================================================================
  // Instruction Builders
  // ============================================================================

  /**
   * Build Initialize instruction
   * Creates the global Registry and Authority accounts
   * @param payer Payer and authority for initialization
   * @returns TransactionInstruction
   */
  buildInitializeInstruction(payer: PublicKey): TransactionInstruction {
    const [registryPDA] = this.deriveRegistryPDA();
    const [authorityPDA] = this.deriveAuthorityPDA();

    const data = createInstructionData(RouterInstruction.Initialize);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: registryPDA, isSigner: false, isWritable: true },
        { pubkey: authorityPDA, isSigner: false, isWritable: true },
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  /**
   * Build Deposit instruction
   * @param mint Token mint to deposit
   * @param amount Amount to deposit (u128)
   * @param user User's public key
   * @param userTokenAccount User's token account
   * @returns TransactionInstruction
   */
  buildDepositInstruction(
    mint: PublicKey,
    amount: BN,
    user: PublicKey,
    userTokenAccount: PublicKey
  ): TransactionInstruction {
    const [portfolioPDA] = this.derivePortfolioPDA(user);
    const [vaultPDA] = this.deriveVaultPDA(mint);
    const [registryPDA] = this.deriveRegistryPDA();

    const data = createInstructionData(
      RouterInstruction.Deposit,
      serializeU128(amount)
    );

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: portfolioPDA, isSigner: false, isWritable: true },
        { pubkey: vaultPDA, isSigner: false, isWritable: true },
        { pubkey: registryPDA, isSigner: false, isWritable: true },
        { pubkey: user, isSigner: true, isWritable: false },
        { pubkey: userTokenAccount, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  /**
   * Build Withdraw instruction
   * @param mint Token mint to withdraw
   * @param amount Amount to withdraw (u128)
   * @param user User's public key
   * @param userTokenAccount User's token account
   * @returns TransactionInstruction
   */
  buildWithdrawInstruction(
    mint: PublicKey,
    amount: BN,
    user: PublicKey,
    userTokenAccount: PublicKey
  ): TransactionInstruction {
    const [portfolioPDA] = this.derivePortfolioPDA(user);
    const [vaultPDA] = this.deriveVaultPDA(mint);
    const [authorityPDA] = this.deriveAuthorityPDA();

    const data = createInstructionData(
      RouterInstruction.Withdraw,
      serializeU128(amount)
    );

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: portfolioPDA, isSigner: false, isWritable: true },
        { pubkey: vaultPDA, isSigner: false, isWritable: true },
        { pubkey: authorityPDA, isSigner: false, isWritable: false },
        { pubkey: user, isSigner: true, isWritable: false },
        { pubkey: userTokenAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  /**
   * Build InitializePortfolio instruction
   * @param user User's public key
   * @returns TransactionInstruction
   */
  buildInitializePortfolioInstruction(
    user: PublicKey
  ): TransactionInstruction {
    const [portfolioPDA] = this.derivePortfolioPDA(user);
    const [registryPDA] = this.deriveRegistryPDA();

    const data = createInstructionData(RouterInstruction.InitializePortfolio);

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: portfolioPDA, isSigner: false, isWritable: true },
        { pubkey: registryPDA, isSigner: false, isWritable: true },
        { pubkey: user, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  /**
   * Build ExecuteCrossSlab instruction
   * Routes a trade across multiple slab markets
   * @param user User's public key
   * @param splits Array of slab splits
   * @param slabProgram Slab program ID
   * @returns TransactionInstruction
   */
  buildExecuteCrossSlabInstruction(
    user: PublicKey,
    splits: SlabSplit[],
    slabProgram: PublicKey
  ): TransactionInstruction {
    const [portfolioPDA] = this.derivePortfolioPDA(user);

    // Serialize splits: num_splits (u8) + splits
    const numSplits = Buffer.from([splits.length]);
    const splitBuffers = splits.map((split) =>
      Buffer.concat([
        serializePubkey(split.slabMarket),
        serializeBool(split.isBuy),
        serializeU128(split.size),
        serializeU128(split.price),
      ])
    );

    const data = createInstructionData(
      RouterInstruction.ExecuteCrossSlab,
      numSplits,
      ...splitBuffers
    );

    // Build account list: portfolio + slab markets
    const keys = [
      { pubkey: portfolioPDA, isSigner: false, isWritable: true },
      { pubkey: user, isSigner: true, isWritable: false },
      { pubkey: slabProgram, isSigner: false, isWritable: false },
    ];

    // Add each slab market
    for (const split of splits) {
      keys.push({ pubkey: split.slabMarket, isSigner: false, isWritable: true });
    }

    return new TransactionInstruction({
      programId: this.programId,
      keys,
      data,
    });
  }

  /**
   * Build LiquidateUser instruction
   * @param params Liquidation parameters
   * @returns TransactionInstruction
   */
  buildLiquidateUserInstruction(
    params: LiquidationParams
  ): TransactionInstruction {
    const [portfolioPDA] = this.derivePortfolioPDA(
      params.portfolio // Note: portfolio is the target user's portfolio pubkey
    );

    const data = createInstructionData(
      RouterInstruction.LiquidateUser,
      serializeBool(params.isPreliq),
      serializeU64(params.currentTs)
    );

    // Build dynamic account list
    const keys = [
      { pubkey: portfolioPDA, isSigner: false, isWritable: true },
      { pubkey: this.wallet?.publicKey || PublicKey.default, isSigner: true, isWritable: false },
    ];

    // Add oracle accounts
    for (const oracle of params.oracles) {
      keys.push({ pubkey: oracle, isSigner: false, isWritable: false });
    }

    // Add slab accounts
    for (const slab of params.slabs) {
      keys.push({ pubkey: slab, isSigner: false, isWritable: true });
    }

    return new TransactionInstruction({
      programId: this.programId,
      keys,
      data,
    });
  }

  /**
   * Build BurnLpShares instruction
   * @param params Burn LP shares parameters
   * @returns TransactionInstruction
   */
  buildBurnLpSharesInstruction(
    params: BurnLpSharesParams
  ): TransactionInstruction {
    const [portfolioPDA] = this.derivePortfolioPDA(params.user);

    const data = createInstructionData(
      RouterInstruction.BurnLpShares,
      serializePubkey(params.marketId),
      serializeU64(params.sharesToBurn),
      serializeI64(params.currentSharePrice),
      serializeU64(params.currentTs),
      serializeU64(params.maxStalenessSeconds)
    );

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: portfolioPDA, isSigner: false, isWritable: true },
        { pubkey: params.user, isSigner: true, isWritable: false },
        { pubkey: params.marketId, isSigner: false, isWritable: true },
      ],
      data,
    });
  }

  /**
   * Build CancelLpOrders instruction
   * @param params Cancel LP orders parameters
   * @returns TransactionInstruction
   */
  buildCancelLpOrdersInstruction(
    params: CancelLpOrdersParams
  ): TransactionInstruction {
    const [portfolioPDA] = this.derivePortfolioPDA(params.user);

    // Limit to 16 orders
    if (params.orderIds.length > 16) {
      throw new Error('Cannot cancel more than 16 orders at once');
    }

    // Serialize: num_orders (u8) + order_ids + freed_quote + freed_base
    const numOrders = Buffer.from([params.orderIds.length]);
    const orderIdBuffers = params.orderIds.map((id) => serializeU64(id));

    const data = createInstructionData(
      RouterInstruction.CancelLpOrders,
      serializePubkey(params.marketId),
      numOrders,
      ...orderIdBuffers,
      serializeU128(params.freedQuote),
      serializeU128(params.freedBase)
    );

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: portfolioPDA, isSigner: false, isWritable: true },
        { pubkey: params.user, isSigner: true, isWritable: false },
        { pubkey: params.marketId, isSigner: false, isWritable: true },
      ],
      data,
    });
  }

  // ============================================================================
  // Deserialization Methods
  // ============================================================================

  private deserializePortfolio(data: Buffer): Portfolio {
    let offset = 8; // Skip discriminator

    const owner = deserializePubkey(data, offset);
    offset += 32;

    const collateralValue = deserializeU128(data, offset);
    offset += 16;

    const maintMargin = deserializeU128(data, offset);
    offset += 16;

    const unrealizedPnl = deserializeI64(data, offset);
    offset += 8;

    const equity = deserializeU128(data, offset);
    offset += 16;

    const health = deserializeI64(data, offset);
    offset += 8;

    const lastUpdate = deserializeU128(data, offset);

    return {
      owner,
      collateralValue,
      maintMargin,
      unrealizedPnl,
      equity,
      health,
      lastUpdate,
    };
  }

  private deserializeRegistry(data: Buffer): Registry {
    let offset = 8; // Skip discriminator

    const authority = deserializePubkey(data, offset);
    offset += 32;

    const numVaults = data.readUInt32LE(offset);
    offset += 4;

    const numPortfolios = data.readUInt32LE(offset);
    offset += 4;

    // Read vault addresses (assuming max 256 vaults)
    const vaults: PublicKey[] = [];
    for (let i = 0; i < numVaults; i++) {
      vaults.push(deserializePubkey(data, offset));
      offset += 32;
    }

    return {
      authority,
      numVaults,
      numPortfolios,
      vaults,
    };
  }

  private deserializeVault(data: Buffer): Vault {
    let offset = 8; // Skip discriminator

    const mint = deserializePubkey(data, offset);
    offset += 32;

    const totalDeposits = deserializeU128(data, offset);
    offset += 16;

    const totalWithdrawals = deserializeU128(data, offset);
    offset += 16;

    const balance = deserializeU128(data, offset);

    return {
      mint,
      totalDeposits,
      totalWithdrawals,
      balance,
    };
  }
}
