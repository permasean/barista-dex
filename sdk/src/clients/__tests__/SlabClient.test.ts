import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import BN from 'bn.js';
import { SlabClient } from '../SlabClient';
import { SlabInstruction, OrderSide } from '../../types/slab';

describe('SlabClient', () => {
  let connection: Connection;
  let programId: PublicKey;
  let wallet: Keypair;
  let client: SlabClient;

  beforeEach(() => {
    connection = new Connection('http://localhost:8899', 'confirmed');
    programId = PublicKey.unique();
    wallet = Keypair.generate();
    client = new SlabClient(connection, programId, wallet);
  });

  describe('PDA Derivation', () => {
    it('should derive slab PDA correctly', () => {
      const lpOwner = PublicKey.unique();
      const instrument = PublicKey.unique();
      const [pda, bump] = client.deriveSlabPDA(lpOwner, instrument);

      expect(pda).toBeInstanceOf(PublicKey);
      expect(typeof bump).toBe('number');
      expect(bump).toBeGreaterThanOrEqual(0);
      expect(bump).toBeLessThanOrEqual(255);
    });

    it('should derive fill receipt PDA correctly', () => {
      const slab = PublicKey.unique();
      const seqno = 42;
      const [pda, bump] = client.deriveFillReceiptPDA(slab, seqno);

      expect(pda).toBeInstanceOf(PublicKey);
      expect(typeof bump).toBe('number');
    });

    it('should derive different PDAs for different seqnos', () => {
      const slab = PublicKey.unique();
      const [pda1] = client.deriveFillReceiptPDA(slab, 1);
      const [pda2] = client.deriveFillReceiptPDA(slab, 2);

      expect(pda1.equals(pda2)).toBe(false);
    });

    it('should derive same slab PDA for same inputs', () => {
      const lpOwner = PublicKey.unique();
      const instrument = PublicKey.unique();
      const [pda1] = client.deriveSlabPDA(lpOwner, instrument);
      const [pda2] = client.deriveSlabPDA(lpOwner, instrument);

      expect(pda1.equals(pda2)).toBe(true);
    });
  });

  describe('Instruction Builders', () => {
    describe('buildInitializeSlabInstruction', () => {
      it('should build valid instruction', () => {
        const lpOwner = PublicKey.unique();
        const routerId = PublicKey.unique();
        const instrument = PublicKey.unique();
        const markPx = new BN(50000000);
        const takerFeeBps = new BN(5000); // 0.5%
        const contractSize = new BN(1000000);
        const payer = wallet.publicKey;

        const ix = client.buildInitializeSlabInstruction(
          lpOwner,
          routerId,
          instrument,
          markPx,
          takerFeeBps,
          contractSize,
          payer
        );

        expect(ix.programId.equals(programId)).toBe(true);
        expect(ix.keys.length).toBe(3); // slab + payer + system_program
        expect(ix.data[0]).toBe(SlabInstruction.Initialize);
        expect(ix.data.length).toBe(122); // 1 (discriminator) + 121 (data)
      });

      it('should include correct accounts', () => {
        const lpOwner = PublicKey.unique();
        const routerId = PublicKey.unique();
        const instrument = PublicKey.unique();
        const payer = wallet.publicKey;

        const ix = client.buildInitializeSlabInstruction(
          lpOwner,
          routerId,
          instrument,
          new BN(0),
          new BN(0),
          new BN(0),
          payer
        );

        expect(ix.keys[0].isWritable).toBe(true); // slab
        expect(ix.keys[1].isSigner).toBe(true); // payer
        expect(ix.keys[2].isWritable).toBe(false); // system_program
      });
    });

    describe('buildCommitFillInstruction', () => {
      it('should build valid instruction for buy', () => {
        const slab = PublicKey.unique();
        const expectedSeqno = 5;
        const side = OrderSide.Bid;
        const qty = new BN(1000000);
        const limitPx = new BN(50000000);
        const routerSigner = wallet.publicKey;

        const ix = client.buildCommitFillInstruction(
          slab,
          expectedSeqno,
          side,
          qty,
          limitPx,
          routerSigner
        );

        expect(ix.programId.equals(programId)).toBe(true);
        expect(ix.keys.length).toBe(3); // slab + receipt + router_signer
        expect(ix.data[0]).toBe(SlabInstruction.CommitFill);
        expect(ix.data.length).toBe(22); // 1 (discriminator) + 21 (data)
      });

      it('should build valid instruction for sell', () => {
        const slab = PublicKey.unique();
        const expectedSeqno = 10;
        const side = OrderSide.Ask;
        const qty = new BN(500000);
        const limitPx = new BN(51000000);
        const routerSigner = wallet.publicKey;

        const ix = client.buildCommitFillInstruction(
          slab,
          expectedSeqno,
          side,
          qty,
          limitPx,
          routerSigner
        );

        expect(ix.data[0]).toBe(SlabInstruction.CommitFill);
        expect(ix.keys[2].pubkey.equals(routerSigner)).toBe(true);
        expect(ix.keys[2].isSigner).toBe(true);
      });

      it('should include correct account flags', () => {
        const slab = PublicKey.unique();
        const routerSigner = wallet.publicKey;

        const ix = client.buildCommitFillInstruction(
          slab,
          0,
          OrderSide.Bid,
          new BN(1),
          new BN(1),
          routerSigner
        );

        expect(ix.keys[0].isWritable).toBe(true); // slab
        expect(ix.keys[1].isWritable).toBe(true); // receipt
        expect(ix.keys[2].isSigner).toBe(true); // router_signer
      });

      it('should encode side correctly', () => {
        const slab = PublicKey.unique();
        const routerSigner = wallet.publicKey;

        const buyIx = client.buildCommitFillInstruction(
          slab,
          0,
          OrderSide.Bid,
          new BN(1),
          new BN(1),
          routerSigner
        );

        const sellIx = client.buildCommitFillInstruction(
          slab,
          0,
          OrderSide.Ask,
          new BN(1),
          new BN(1),
          routerSigner
        );

        // Side is at offset 5 (1 disc + 4 seqno)
        expect(buyIx.data[5]).toBe(0); // Bid = 0
        expect(sellIx.data[5]).toBe(1); // Ask = 1
      });
    });
  });

  describe('Higher-Level Methods', () => {
    describe('getOrderBook', () => {
      it('should return empty order book for v0', async () => {
        const slab = PublicKey.unique();

        // Mock getSlabState to return valid state
        jest.spyOn(client, 'getSlabState').mockResolvedValue({
          lpOwner: PublicKey.unique(),
          routerId: PublicKey.unique(),
          instrument: PublicKey.unique(),
          markPx: new BN(50000000),
          takerFeeBps: new BN(5000),
          contractSize: new BN(1000000),
          seqno: 0,
          bump: 255,
        });

        const orderBook = await client.getOrderBook(slab);

        expect(orderBook.bids).toEqual([]);
        expect(orderBook.asks).toEqual([]);
        expect(orderBook.lastUpdate).toBeInstanceOf(BN);
      });

      it('should throw error if slab not found', async () => {
        const slab = PublicKey.unique();

        jest.spyOn(client, 'getSlabState').mockResolvedValue(null);

        await expect(client.getOrderBook(slab)).rejects.toThrow('Slab not found');
      });
    });

    describe('getRecentTrades', () => {
      it('should return empty array for v0', async () => {
        const slab = PublicKey.unique();
        const trades = await client.getRecentTrades(slab, 10);

        expect(trades).toEqual([]);
      });
    });

    describe('getOpenOrders', () => {
      it('should return empty array for v0', async () => {
        const slab = PublicKey.unique();
        const user = PublicKey.unique();
        const orders = await client.getOpenOrders(slab, user);

        expect(orders).toEqual([]);
      });
    });
  });
});
