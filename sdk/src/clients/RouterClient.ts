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
  SlabInfo,
} from '../types/discovery';
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

  /**
   * Get all registered slabs from on-chain accounts
   * Note: In v0, this requires scanning for slab accounts by owner (slab program).
   * Future: Registry will maintain a list of registered slabs.
   * @param slabProgramId Slab program ID to scan for
   * @returns Array of slab info
   */
  async getAllSlabs(slabProgramId: PublicKey): Promise<SlabInfo[]> {
    // Get all accounts owned by the slab program
    const accounts = await this.connection.getProgramAccounts(slabProgramId, {
      filters: [
        {
          dataSize: 4096, // Approximate size of SlabState in v0 (~4KB)
        },
      ],
    });

    const slabs: SlabInfo[] = [];

    for (const { pubkey, account } of accounts) {
      try {
        // Parse slab state (simplified for v0)
        // Assuming SlabState layout: magic(8) + version(4) + seqno(4) + program_id(32) + lp_owner(32) + router_id(32) + instrument(32) + ...
        let offset = 0;

        // Skip magic (8 bytes)
        offset += 8;

        // Skip version (4 bytes)
        offset += 4;

        // Read seqno (4 bytes)
        const seqno = account.data.readUInt32LE(offset);
        offset += 4;

        // Skip program_id (32 bytes)
        offset += 32;

        // Read lp_owner (32 bytes)
        const lpOwner = new PublicKey(account.data.slice(offset, offset + 32));
        offset += 32;

        // Skip router_id (32 bytes)
        offset += 32;

        // Read instrument (32 bytes)
        const instrument = new PublicKey(account.data.slice(offset, offset + 32));
        offset += 32;

        // Read contract_size (8 bytes, i64)
        const contractSize = new BN(account.data.readBigInt64LE(offset).toString());
        offset += 8;

        // Skip tick (8 bytes)
        offset += 8;

        // Skip lot (8 bytes)
        offset += 8;

        // Read mark_px (8 bytes, i64)
        const markPx = new BN(account.data.readBigInt64LE(offset).toString());
        offset += 8;

        // Read taker_fee_bps (8 bytes, i64)
        const takerFeeBps = new BN(account.data.readBigInt64LE(offset).toString());

        slabs.push({
          address: pubkey,
          lpOwner,
          instrument,
          markPx,
          takerFeeBps,
          contractSize,
          seqno,
        });
      } catch (err) {
        // Skip invalid accounts
        continue;
      }
    }

    return slabs;
  }

  /**
   * Find slabs trading a specific instrument
   * @param instrumentId Instrument public key
   * @param slabProgramId Slab program ID to scan
   * @returns Array of slab addresses
   */
  async getSlabsForInstrument(
    instrumentId: PublicKey,
    slabProgramId: PublicKey
  ): Promise<PublicKey[]> {
    const allSlabs = await this.getAllSlabs(slabProgramId);
    return allSlabs
      .filter(s => s.instrument.equals(instrumentId))
      .map(s => s.address);
  }

  // ============================================================================
  // Leverage & Margin Validation Helpers
  // ============================================================================

  /**
   * Calculate required margin for a position with optional leverage
   *
   * @param notional Position notional value (quantity * price)
   * @param leverage Leverage multiplier (1 = spot, 2-10 = margin). Default: 1 (spot)
   * @returns Required margin amount
   *
   * Examples:
   * - Spot trading (1x): notional = 1000 USDC -> required = 1000 USDC
   * - 5x leverage: notional = 1000 USDC -> required = 1000 * 0.1 / 5 = 20 USDC
   * - 10x leverage: notional = 1000 USDC -> required = 1000 * 0.1 / 10 = 10 USDC
   */
  calculateRequiredMargin(notional: BN, leverage: number = 1): BN {
    if (leverage === 1) {
      // Spot trading: require full notional
      return notional;
    }

    // Margin trading: IMR = 10% hardcoded on-chain
    const IMR_PCT = 10;

    // required_margin = notional * IMR / leverage
    // = notional * 0.1 / leverage
    return notional.mul(new BN(IMR_PCT)).div(new BN(leverage * 100));
  }

  /**
   * Validate if user has sufficient margin for a leveraged position
   *
   * @param user User's public key
   * @param quantity Position size (base units)
   * @param price Limit price (1e6 scale)
   * @param leverage Leverage multiplier (1 = spot, 2-10 = margin). Default: 1 (spot)
   * @returns Validation result with available equity and required margin
   *
   * @throws Error if portfolio doesn't exist or cannot be fetched
   */
  async validateLeveragedPosition(
    user: PublicKey,
    quantity: BN,
    price: BN,
    leverage: number = 1
  ): Promise<{
    valid: boolean;
    availableEquity: BN;
    requiredMargin: BN;
    notional: BN;
    leverage: number;
    mode: 'spot' | 'margin';
  }> {
    // Validate leverage range
    if (leverage < 1 || leverage > 10) {
      throw new Error('Leverage must be between 1x and 10x');
    }

    // Get portfolio equity
    const [portfolioPDA] = this.derivePortfolioPDA(user);
    const portfolio = await this.getPortfolio(portfolioPDA);

    if (!portfolio) {
      throw new Error('Portfolio not found. Please initialize portfolio first.');
    }

    // Calculate notional value
    // notional = quantity * price / 1e6 (price scale factor)
    const notional = quantity.mul(price).div(new BN(1_000_000));

    // Calculate required margin
    const requiredMargin = this.calculateRequiredMargin(notional, leverage);

    // Check if equity >= required margin
    const availableEquity = new BN(portfolio.equity.toString());
    const valid = availableEquity.gte(requiredMargin);

    return {
      valid,
      availableEquity,
      requiredMargin,
      notional,
      leverage,
      mode: leverage === 1 ? 'spot' : 'margin',
    };
  }

  /**
   * Calculate maximum quantity that can be traded with available equity
   *
   * @param user User's public key
   * @param price Limit price (1e6 scale)
   * @param leverage Leverage multiplier (1 = spot, 2-10 = margin). Default: 1 (spot)
   * @returns Maximum tradeable quantity
   *
   * Examples:
   * - equity = 100 USDC, price = 50 USDC, leverage = 1x -> max = 2 units
   * - equity = 100 USDC, price = 50 USDC, leverage = 5x -> max = 100 units
   */
  async calculateMaxQuantity(
    user: PublicKey,
    price: BN,
    leverage: number = 1
  ): Promise<BN> {
    // Validate leverage range
    if (leverage < 1 || leverage > 10) {
      throw new Error('Leverage must be between 1x and 10x');
    }

    // Get portfolio equity
    const [portfolioPDA] = this.derivePortfolioPDA(user);
    const portfolio = await this.getPortfolio(portfolioPDA);

    if (!portfolio) {
      throw new Error('Portfolio not found. Please initialize portfolio first.');
    }

    const availableEquity = new BN(portfolio.equity.toString());

    if (leverage === 1) {
      // Spot: max_quantity = equity / price * 1e6
      return availableEquity.mul(new BN(1_000_000)).div(price);
    }

    // Margin: max_quantity = equity * leverage / (IMR * price) * 1e6
    // Simplified: equity * leverage * 10 / price
    const IMR_PCT = 10;
    return availableEquity
      .mul(new BN(leverage))
      .mul(new BN(100))
      .div(new BN(IMR_PCT))
      .mul(new BN(1_000_000))
      .div(price);
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

  // ============================================================================
  // Convenience Methods for Trading (v0 - Atomic Fills)
  // ============================================================================

  /**
   * Build a buy instruction (market order that executes immediately)
   * V0: Atomic fill only - no resting orders
   * @param user User's public key
   * @param slabMarket Slab market to trade on
   * @param quantity Quantity to buy (in base units)
   * @param limitPrice Maximum price willing to pay (in quote units)
   * @param slabProgram Slab program ID
   * @returns TransactionInstruction
   */
  buildBuyInstruction(
    user: PublicKey,
    slabMarket: PublicKey,
    quantity: BN,
    limitPrice: BN,
    slabProgram: PublicKey
  ): TransactionInstruction {
    const split: SlabSplit = {
      slabMarket,
      isBuy: true,
      size: quantity,
      price: limitPrice,
    };

    return this.buildExecuteCrossSlabInstruction(user, [split], slabProgram);
  }

  /**
   * Build a sell instruction (market order that executes immediately)
   * V0: Atomic fill only - no resting orders
   * @param user User's public key
   * @param slabMarket Slab market to trade on
   * @param quantity Quantity to sell (in base units)
   * @param limitPrice Minimum price willing to accept (in quote units)
   * @param slabProgram Slab program ID
   * @returns TransactionInstruction
   */
  buildSellInstruction(
    user: PublicKey,
    slabMarket: PublicKey,
    quantity: BN,
    limitPrice: BN,
    slabProgram: PublicKey
  ): TransactionInstruction {
    const split: SlabSplit = {
      slabMarket,
      isBuy: false,
      size: quantity,
      price: limitPrice,
    };

    return this.buildExecuteCrossSlabInstruction(user, [split], slabProgram);
  }
}
