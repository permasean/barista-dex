import {
  Connection,
  PublicKey,
  TransactionInstruction,
  Keypair,
  SystemProgram,
} from '@solana/web3.js';
import BN from 'bn.js';
import {
  SlabInstruction,
  OrderSide,
  OrderBook,
  PlaceOrderParams,
  CancelOrderParams,
  OpenOrder,
  Trade,
} from '../types/slab';
import {
  serializeU64,
  serializeI64,
  serializeU32,
  serializePubkey,
  createInstructionData,
  deserializeU64,
  deserializeI64,
  deserializePubkey,
} from '../utils/serialization';

/**
 * Slab state structure
 */
export interface SlabState {
  lpOwner: PublicKey;
  routerId: PublicKey;
  instrument: PublicKey;
  markPx: BN;
  takerFeeBps: BN;
  contractSize: BN;
  seqno: number;
  bump: number;
}

/**
 * Fill receipt structure
 */
export interface FillReceipt {
  slab: PublicKey;
  seqno: number;
  side: OrderSide;
  qty: BN;
  fillPx: BN;
  timestamp: BN;
}

/**
 * Client for interacting with the Barista DEX Slab program
 */
export class SlabClient {
  /**
   * Create a new SlabClient
   * @param connection Solana connection
   * @param programId Slab program ID
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
   * Derive Slab PDA
   * @param lpOwner LP owner's public key
   * @param instrument Instrument (perp market) public key
   * @returns [PDA, bump]
   */
  deriveSlabPDA(lpOwner: PublicKey, instrument: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('slab'),
        lpOwner.toBuffer(),
        instrument.toBuffer(),
      ],
      this.programId
    );
  }

  /**
   * Derive Fill Receipt PDA
   * @param slab Slab public key
   * @param seqno Sequence number
   * @returns [PDA, bump]
   */
  deriveFillReceiptPDA(slab: PublicKey, seqno: number): [PublicKey, number] {
    const seqnoBuffer = Buffer.alloc(4);
    seqnoBuffer.writeUInt32LE(seqno);

    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('receipt'),
        slab.toBuffer(),
        seqnoBuffer,
      ],
      this.programId
    );
  }

  // ============================================================================
  // Account Fetching Methods
  // ============================================================================

  /**
   * Fetch Slab state account data
   * @param slab Slab public key
   * @returns Slab state data
   */
  async getSlabState(slab: PublicKey): Promise<SlabState | null> {
    const accountInfo = await this.connection.getAccountInfo(slab);

    if (!accountInfo) {
      return null;
    }

    return this.deserializeSlabState(accountInfo.data);
  }

  /**
   * Fetch Fill Receipt account data
   * @param slab Slab public key
   * @param seqno Sequence number
   * @returns Fill receipt data
   */
  async getFillReceipt(slab: PublicKey, seqno: number): Promise<FillReceipt | null> {
    const [receiptPDA] = this.deriveFillReceiptPDA(slab, seqno);
    const accountInfo = await this.connection.getAccountInfo(receiptPDA);

    if (!accountInfo) {
      return null;
    }

    return this.deserializeFillReceipt(accountInfo.data);
  }

  // ============================================================================
  // Instruction Builders
  // ============================================================================

  /**
   * Build Initialize Slab instruction
   * @param lpOwner LP owner's public key
   * @param routerId Router program ID
   * @param instrument Instrument (perp market) public key
   * @param markPx Initial mark price (1e6 scale)
   * @param takerFeeBps Taker fee in basis points (1e6 scale)
   * @param contractSize Contract size (1e6 scale)
   * @param payer Payer and authority
   * @returns TransactionInstruction
   */
  buildInitializeSlabInstruction(
    lpOwner: PublicKey,
    routerId: PublicKey,
    instrument: PublicKey,
    markPx: BN,
    takerFeeBps: BN,
    contractSize: BN,
    payer: PublicKey
  ): TransactionInstruction {
    const [slabPDA, bump] = this.deriveSlabPDA(lpOwner, instrument);

    // Data layout: lp_owner (32) + router_id (32) + instrument (32) + mark_px (8) + taker_fee_bps (8) + contract_size (8) + bump (1) = 121 bytes
    const data = createInstructionData(
      SlabInstruction.Initialize,
      serializePubkey(lpOwner),
      serializePubkey(routerId),
      serializePubkey(instrument),
      serializeI64(markPx),
      serializeI64(takerFeeBps),
      serializeI64(contractSize),
      Buffer.from([bump])
    );

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: slabPDA, isSigner: false, isWritable: true },
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  /**
   * Build CommitFill instruction (v0 - atomic fill)
   * @param slab Slab public key
   * @param expectedSeqno Expected slab sequence number (TOCTOU protection)
   * @param side Order side (Buy or Sell)
   * @param qty Quantity to fill (1e6 scale)
   * @param limitPx Limit price (1e6 scale)
   * @param routerSigner Router signer
   * @returns TransactionInstruction
   */
  buildCommitFillInstruction(
    slab: PublicKey,
    expectedSeqno: number,
    side: OrderSide,
    qty: BN,
    limitPx: BN,
    routerSigner: PublicKey
  ): TransactionInstruction {
    // Get the next sequence number for receipt
    const [receiptPDA] = this.deriveFillReceiptPDA(slab, expectedSeqno);

    // Data layout: expected_seqno (4) + side (1) + qty (8) + limit_px (8) = 21 bytes
    const sideBuffer = Buffer.from([side === OrderSide.Bid ? 0 : 1]);

    const data = createInstructionData(
      SlabInstruction.CommitFill,
      serializeU32(expectedSeqno),
      sideBuffer,
      serializeI64(qty),
      serializeI64(limitPx)
    );

    return new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: slab, isSigner: false, isWritable: true },
        { pubkey: receiptPDA, isSigner: false, isWritable: true },
        { pubkey: routerSigner, isSigner: true, isWritable: false },
      ],
      data,
    });
  }

  // ============================================================================
  // Higher-Level Methods (Stub implementations for future expansion)
  // ============================================================================

  /**
   * Get order book snapshot (stub - v0 doesn't have full order book)
   * @param slab Slab public key
   * @returns Order book snapshot
   */
  async getOrderBook(slab: PublicKey): Promise<OrderBook> {
    // In v0, we only have atomic fills, no persistent order book
    // This is a stub for future expansion
    const slabState = await this.getSlabState(slab);

    if (!slabState) {
      throw new Error('Slab not found');
    }

    return {
      bids: [],
      asks: [],
      lastUpdate: new BN(Date.now() / 1000),
    };
  }

  /**
   * Get recent trades (stub - requires indexing)
   * @param slab Slab public key
   * @param limit Number of trades to fetch
   * @returns Recent trades
   */
  async getRecentTrades(slab: PublicKey, limit: number = 20): Promise<Trade[]> {
    // This requires indexing fill receipts
    // Stub for future expansion
    return [];
  }

  /**
   * Get open orders for a user (stub - v0 doesn't have persistent orders)
   * @param slab Slab public key
   * @param user User's public key
   * @returns Open orders
   */
  async getOpenOrders(slab: PublicKey, user: PublicKey): Promise<OpenOrder[]> {
    // v0 only has atomic fills, no persistent orders
    // Stub for future expansion
    return [];
  }

  // ============================================================================
  // Deserialization Methods
  // ============================================================================

  private deserializeSlabState(data: Buffer): SlabState {
    let offset = 8; // Skip discriminator

    const lpOwner = deserializePubkey(data, offset);
    offset += 32;

    const routerId = deserializePubkey(data, offset);
    offset += 32;

    const instrument = deserializePubkey(data, offset);
    offset += 32;

    const markPx = deserializeI64(data, offset);
    offset += 8;

    const takerFeeBps = deserializeI64(data, offset);
    offset += 8;

    const contractSize = deserializeI64(data, offset);
    offset += 8;

    const seqno = data.readUInt32LE(offset);
    offset += 4;

    const bump = data.readUInt8(offset);

    return {
      lpOwner,
      routerId,
      instrument,
      markPx,
      takerFeeBps,
      contractSize,
      seqno,
      bump,
    };
  }

  private deserializeFillReceipt(data: Buffer): FillReceipt {
    let offset = 8; // Skip discriminator

    const slab = deserializePubkey(data, offset);
    offset += 32;

    const seqno = data.readUInt32LE(offset);
    offset += 4;

    const sideValue = data.readUInt8(offset);
    const side = sideValue === 0 ? OrderSide.Bid : OrderSide.Ask;
    offset += 1;

    const qty = deserializeI64(data, offset);
    offset += 8;

    const fillPx = deserializeI64(data, offset);
    offset += 8;

    const timestamp = deserializeU64(data, offset);

    return {
      slab,
      seqno,
      side,
      qty,
      fillPx,
      timestamp,
    };
  }
}

