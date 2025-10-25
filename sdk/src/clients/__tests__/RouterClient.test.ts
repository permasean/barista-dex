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

  describe('Leverage & Margin Helpers', () => {
    describe('calculatePositionSize', () => {
      it('should calculate correct position size for spot (1x)', () => {
        const marginCommitted = new BN(1000);
        const leverage = 1;
        const positionSize = client.calculatePositionSize(marginCommitted, leverage);

        expect(positionSize.toString()).toBe('1000');
      });

      it('should calculate correct position size for 5x leverage', () => {
        const marginCommitted = new BN(1000);
        const leverage = 5;
        const positionSize = client.calculatePositionSize(marginCommitted, leverage);

        expect(positionSize.toString()).toBe('5000');
      });

      it('should calculate correct position size for 10x leverage', () => {
        const marginCommitted = new BN(500);
        const leverage = 10;
        const positionSize = client.calculatePositionSize(marginCommitted, leverage);

        expect(positionSize.toString()).toBe('5000');
      });

      it('should handle large numbers', () => {
        const marginCommitted = new BN('1000000000'); // 1 billion
        const leverage = 5;
        const positionSize = client.calculatePositionSize(marginCommitted, leverage);

        expect(positionSize.toString()).toBe('5000000000');
      });
    });

    describe('calculateActualQuantity', () => {
      it('should calculate actual quantity for spot (1x)', () => {
        const quantityInput = new BN(100);
        const price = new BN(10_000_000); // 10 USDC in 1e6 scale
        const leverage = 1;
        const actualQty = client.calculateActualQuantity(quantityInput, price, leverage);

        expect(actualQty.toString()).toBe('100');
      });

      it('should calculate actual quantity for 5x leverage', () => {
        const quantityInput = new BN(100);
        const price = new BN(10_000_000);
        const leverage = 5;
        const actualQty = client.calculateActualQuantity(quantityInput, price, leverage);

        expect(actualQty.toString()).toBe('500'); // 100 * 5
      });

      it('should calculate actual quantity for 10x leverage', () => {
        const quantityInput = new BN(50);
        const price = new BN(20_000_000);
        const leverage = 10;
        const actualQty = client.calculateActualQuantity(quantityInput, price, leverage);

        expect(actualQty.toString()).toBe('500'); // 50 * 10
      });

      it('should work correctly with different price scales', () => {
        const quantityInput = new BN(1000);
        const price = new BN(1_000_000); // 1 USDC
        const leverage = 2;
        const actualQty = client.calculateActualQuantity(quantityInput, price, leverage);

        expect(actualQty.toString()).toBe('2000');
      });
    });

    describe('calculateMaxQuantityInput', () => {
      it('should throw error for invalid leverage (< 1)', async () => {
        const user = PublicKey.unique();
        const price = new BN(10_000_000);

        await expect(
          client.calculateMaxQuantityInput(user, price, 0.5)
        ).rejects.toThrow('Leverage must be between 1x and 10x');
      });

      it('should throw error for invalid leverage (> 10)', async () => {
        const user = PublicKey.unique();
        const price = new BN(10_000_000);

        await expect(
          client.calculateMaxQuantityInput(user, price, 11)
        ).rejects.toThrow('Leverage must be between 1x and 10x');
      });

      // Note: Tests with actual portfolio fetching require network/mocked connection
    });

    describe('validateLeveragedPosition', () => {
      it('should throw error for invalid leverage range', async () => {
        const user = PublicKey.unique();
        const quantity = new BN(100);
        const price = new BN(10_000_000);

        await expect(
          client.validateLeveragedPosition(user, quantity, price, 0)
        ).rejects.toThrow('Leverage must be between 1x and 10x');

        await expect(
          client.validateLeveragedPosition(user, quantity, price, 15)
        ).rejects.toThrow('Leverage must be between 1x and 10x');
      });

      // Note: Full integration tests with mocked portfolio would go here
      // These would test the actual validation logic with different equity levels
    });

    describe('Leverage calculation examples', () => {
      it('should correctly model spot trading (1x)', () => {
        // User wants to commit 100 units at price 10 USDC
        const quantityInput = new BN(100);
        const price = new BN(10_000_000); // 10 USDC
        const leverage = 1;

        // Calculate what happens
        const marginCommitted = quantityInput.mul(price).div(new BN(1_000_000));
        const positionSize = client.calculatePositionSize(marginCommitted, leverage);
        const actualQuantity = client.calculateActualQuantity(quantityInput, price, leverage);

        // Verify: spot trading means 1:1
        expect(marginCommitted.toString()).toBe('1000'); // 100 * 10 = 1000 USDC
        expect(positionSize.toString()).toBe('1000'); // Same as margin
        expect(actualQuantity.toString()).toBe('100'); // Same as input
      });

      it('should correctly model 5x leverage trading', () => {
        // User wants to commit 100 units at price 10 USDC with 5x leverage
        const quantityInput = new BN(100);
        const price = new BN(10_000_000); // 10 USDC
        const leverage = 5;

        // Calculate
        const marginCommitted = quantityInput.mul(price).div(new BN(1_000_000));
        const positionSize = client.calculatePositionSize(marginCommitted, leverage);
        const actualQuantity = client.calculateActualQuantity(quantityInput, price, leverage);

        // Verify: 5x multiplier effect
        expect(marginCommitted.toString()).toBe('1000'); // 100 * 10 = 1000 USDC committed
        expect(positionSize.toString()).toBe('5000'); // 1000 * 5 = 5000 USDC position
        expect(actualQuantity.toString()).toBe('500'); // 100 * 5 = 500 contracts
      });

      it('should correctly model 10x leverage trading', () => {
        // User commits 50 units at 20 USDC with max 10x leverage
        const quantityInput = new BN(50);
        const price = new BN(20_000_000); // 20 USDC
        const leverage = 10;

        const marginCommitted = quantityInput.mul(price).div(new BN(1_000_000));
        const positionSize = client.calculatePositionSize(marginCommitted, leverage);
        const actualQuantity = client.calculateActualQuantity(quantityInput, price, leverage);

        expect(marginCommitted.toString()).toBe('1000'); // 50 * 20 = 1000 USDC
        expect(positionSize.toString()).toBe('10000'); // 1000 * 10 = 10000 USDC position
        expect(actualQuantity.toString()).toBe('500'); // 50 * 10 = 500 contracts
      });

      it('should demonstrate leverage independence from max quantity input', () => {
        // With 1000 USDC equity and 10 USDC price:
        // Max quantity input is always 100 (equity / price)
        // But leverage changes the actual position opened
        const equity = new BN(1000);
        const price = new BN(10_000_000);

        // Max input: equity / price * 1e6
        const maxInput = equity.mul(new BN(1_000_000)).div(price);
        expect(maxInput.toString()).toBe('100');

        // At 1x: opens 100-unit position
        const pos1x = client.calculateActualQuantity(maxInput, price, 1);
        expect(pos1x.toString()).toBe('100');

        // At 5x: opens 500-unit position (same input!)
        const pos5x = client.calculateActualQuantity(maxInput, price, 5);
        expect(pos5x.toString()).toBe('500');

        // At 10x: opens 1000-unit position (same input!)
        const pos10x = client.calculateActualQuantity(maxInput, price, 10);
        expect(pos10x.toString()).toBe('1000');
      });
    });
  });
});
