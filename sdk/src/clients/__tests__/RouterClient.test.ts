import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import BN from 'bn.js';
import { RouterClient } from '../RouterClient';
import {
  RouterInstruction,
  SlabSplit,
  LiquidationParams,
  BurnLpSharesParams,
  CancelLpOrdersParams,
} from '../../types/router';

describe('RouterClient', () => {
  let connection: Connection;
  let programId: PublicKey;
  let wallet: Keypair;
  let client: RouterClient;

  beforeEach(() => {
    connection = new Connection('http://localhost:8899', 'confirmed');
    programId = PublicKey.unique();
    wallet = Keypair.generate();
    client = new RouterClient(connection, programId, wallet);
  });

  describe('PDA Derivation', () => {
    it('should derive portfolio PDA correctly', () => {
      const user = PublicKey.unique();
      const [pda, bump] = client.derivePortfolioPDA(user);

      expect(pda).toBeInstanceOf(PublicKey);
      expect(typeof bump).toBe('number');
      expect(bump).toBeGreaterThanOrEqual(0);
      expect(bump).toBeLessThanOrEqual(255);
    });

    it('should derive vault PDA correctly', () => {
      const mint = PublicKey.unique();
      const [pda, bump] = client.deriveVaultPDA(mint);

      expect(pda).toBeInstanceOf(PublicKey);
      expect(typeof bump).toBe('number');
    });

    it('should derive registry PDA correctly', () => {
      const [pda, bump] = client.deriveRegistryPDA();

      expect(pda).toBeInstanceOf(PublicKey);
      expect(typeof bump).toBe('number');
    });

    it('should derive authority PDA correctly', () => {
      const [pda, bump] = client.deriveAuthorityPDA();

      expect(pda).toBeInstanceOf(PublicKey);
      expect(typeof bump).toBe('number');
    });

    it('should derive same PDA for same inputs', () => {
      const user = PublicKey.unique();
      const [pda1] = client.derivePortfolioPDA(user);
      const [pda2] = client.derivePortfolioPDA(user);

      expect(pda1.equals(pda2)).toBe(true);
    });
  });

  describe('Instruction Builders', () => {
    describe('buildInitializeInstruction', () => {
      it('should build valid instruction', () => {
        const payer = wallet.publicKey;
        const ix = client.buildInitializeInstruction(payer);

        expect(ix.programId.equals(programId)).toBe(true);
        expect(ix.keys.length).toBe(5);
        expect(ix.data[0]).toBe(RouterInstruction.Initialize);
      });
    });

    describe('buildDepositInstruction', () => {
      it('should build valid deposit instruction', () => {
        const mint = PublicKey.unique();
        const amount = new BN(1000000);
        const user = wallet.publicKey;
        const userTokenAccount = PublicKey.unique();

        const ix = client.buildDepositInstruction(mint, amount, user, userTokenAccount);

        expect(ix.programId.equals(programId)).toBe(true);
        expect(ix.keys.length).toBe(7);
        expect(ix.data[0]).toBe(RouterInstruction.Deposit);
        expect(ix.data.length).toBe(17); // 1 (discriminator) + 16 (u128)
      });
    });

    describe('buildWithdrawInstruction', () => {
      it('should build valid withdraw instruction', () => {
        const mint = PublicKey.unique();
        const amount = new BN(500000);
        const user = wallet.publicKey;
        const userTokenAccount = PublicKey.unique();

        const ix = client.buildWithdrawInstruction(mint, amount, user, userTokenAccount);

        expect(ix.programId.equals(programId)).toBe(true);
        expect(ix.keys.length).toBe(6);
        expect(ix.data[0]).toBe(RouterInstruction.Withdraw);
        expect(ix.data.length).toBe(17); // 1 (discriminator) + 16 (u128)
      });
    });

    describe('buildInitializePortfolioInstruction', () => {
      it('should build valid instruction', () => {
        const user = wallet.publicKey;
        const ix = client.buildInitializePortfolioInstruction(user);

        expect(ix.programId.equals(programId)).toBe(true);
        expect(ix.keys.length).toBe(5);
        expect(ix.data[0]).toBe(RouterInstruction.InitializePortfolio);
      });
    });

    describe('buildExecuteCrossSlabInstruction', () => {
      it('should build valid instruction with single split', () => {
        const user = wallet.publicKey;
        const slabProgram = PublicKey.unique();
        const splits: SlabSplit[] = [
          {
            slabMarket: PublicKey.unique(),
            isBuy: true,
            size: new BN(1000000),
            price: new BN(50000000),
          },
        ];

        const ix = client.buildExecuteCrossSlabInstruction(user, splits, slabProgram);

        expect(ix.programId.equals(programId)).toBe(true);
        expect(ix.keys.length).toBe(4); // portfolio + user + slab_program + 1 market
        expect(ix.data[0]).toBe(RouterInstruction.ExecuteCrossSlab);
        expect(ix.data[1]).toBe(1); // num_splits
      });

      it('should build valid instruction with multiple splits', () => {
        const user = wallet.publicKey;
        const slabProgram = PublicKey.unique();
        const splits: SlabSplit[] = [
          {
            slabMarket: PublicKey.unique(),
            isBuy: true,
            size: new BN(1000000),
            price: new BN(50000000),
          },
          {
            slabMarket: PublicKey.unique(),
            isBuy: false,
            size: new BN(500000),
            price: new BN(51000000),
          },
        ];

        const ix = client.buildExecuteCrossSlabInstruction(user, splits, slabProgram);

        expect(ix.keys.length).toBe(5); // portfolio + user + slab_program + 2 markets
        expect(ix.data[1]).toBe(2); // num_splits
      });
    });

    describe('buildLiquidateUserInstruction', () => {
      it('should build valid instruction', () => {
        const params: LiquidationParams = {
          portfolio: PublicKey.unique(),
          oracles: [PublicKey.unique(), PublicKey.unique()],
          slabs: [PublicKey.unique()],
          isPreliq: false,
          currentTs: new BN(Date.now() / 1000),
        };

        const ix = client.buildLiquidateUserInstruction(params);

        expect(ix.programId.equals(programId)).toBe(true);
        expect(ix.data[0]).toBe(RouterInstruction.LiquidateUser);
        // 2 (signer + portfolio) + 2 oracles + 1 slab = 5 accounts
        expect(ix.keys.length).toBe(5);
      });

      it('should handle preliq flag', () => {
        const params: LiquidationParams = {
          portfolio: PublicKey.unique(),
          oracles: [],
          slabs: [],
          isPreliq: true,
          currentTs: new BN(Date.now() / 1000),
        };

        const ix = client.buildLiquidateUserInstruction(params);
        expect(ix.data[1]).toBe(1); // isPreliq = true
      });
    });

    describe('buildBurnLpSharesInstruction', () => {
      it('should build valid instruction', () => {
        const params: BurnLpSharesParams = {
          user: wallet.publicKey,
          marketId: PublicKey.unique(),
          sharesToBurn: new BN(1000000),
          currentSharePrice: new BN(1050000),
          currentTs: new BN(Date.now() / 1000),
          maxStalenessSeconds: new BN(60),
        };

        const ix = client.buildBurnLpSharesInstruction(params);

        expect(ix.programId.equals(programId)).toBe(true);
        expect(ix.keys.length).toBe(3);
        expect(ix.data[0]).toBe(RouterInstruction.BurnLpShares);
        expect(ix.data.length).toBe(65); // 1 + 32 + 8 + 8 + 8 + 8
      });
    });

    describe('buildCancelLpOrdersInstruction', () => {
      it('should build valid instruction with single order', () => {
        const params: CancelLpOrdersParams = {
          user: wallet.publicKey,
          marketId: PublicKey.unique(),
          orderIds: [new BN(1)],
          freedQuote: new BN(1000000),
          freedBase: new BN(500000),
        };

        const ix = client.buildCancelLpOrdersInstruction(params);

        expect(ix.programId.equals(programId)).toBe(true);
        expect(ix.keys.length).toBe(3);
        expect(ix.data[0]).toBe(RouterInstruction.CancelLpOrders);
      });

      it('should build valid instruction with multiple orders', () => {
        const params: CancelLpOrdersParams = {
          user: wallet.publicKey,
          marketId: PublicKey.unique(),
          orderIds: [new BN(1), new BN(2), new BN(3)],
          freedQuote: new BN(1000000),
          freedBase: new BN(500000),
        };

        const ix = client.buildCancelLpOrdersInstruction(params);
        expect(ix.keys.length).toBe(3);
      });

      it('should throw error when exceeding max orders', () => {
        const orderIds = Array.from({ length: 17 }, (_, i) => new BN(i + 1));
        const params: CancelLpOrdersParams = {
          user: wallet.publicKey,
          marketId: PublicKey.unique(),
          orderIds,
          freedQuote: new BN(1000000),
          freedBase: new BN(500000),
        };

        expect(() => client.buildCancelLpOrdersInstruction(params)).toThrow(
          'Cannot cancel more than 16 orders at once'
        );
      });
    });
  });
});
