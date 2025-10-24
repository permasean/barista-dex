import BN from 'bn.js';
import {
  formatAmount,
  formatPrice,
  calculateSpread,
  formatSignature,
  formatPublicKey,
  getExplorerUrl,
} from '../../utils/display';

describe('Display Utilities', () => {
  describe('formatAmount', () => {
    it('should format BN with default 6 decimals', () => {
      const amount = new BN('1000000');
      expect(formatAmount(amount)).toBe('1.000000');
    });

    it('should format BN with custom decimals', () => {
      const amount = new BN('1000000000');
      expect(formatAmount(amount, 9)).toBe('1.000000000');
    });

    it('should handle zero', () => {
      const amount = new BN(0);
      expect(formatAmount(amount)).toBe('0.000000');
    });

    it('should handle large numbers', () => {
      const amount = new BN('123456789012');
      expect(formatAmount(amount, 6)).toBe('123456.789012');
    });

    it('should pad fractional part with zeros', () => {
      const amount = new BN('1000001');
      expect(formatAmount(amount, 6)).toBe('1.000001');
    });
  });

  describe('formatPrice', () => {
    it('should format price with 6 decimals', () => {
      const price = new BN('50000000000');
      expect(formatPrice(price)).toBe('50000.000000');
    });
  });

  describe('calculateSpread', () => {
    it('should calculate spread percentage', () => {
      const bid = new BN('100000000');
      const ask = new BN('100100000');
      expect(calculateSpread(bid, ask)).toBe('0.10');
    });

    it('should handle zero bid', () => {
      const bid = new BN(0);
      const ask = new BN('100000000');
      expect(calculateSpread(bid, ask)).toBe('0.00');
    });

    it('should handle equal bid and ask', () => {
      const bid = new BN('100000000');
      const ask = new BN('100000000');
      expect(calculateSpread(bid, ask)).toBe('0.00');
    });

    it('should handle large spreads', () => {
      const bid = new BN('100000000');
      const ask = new BN('110000000');
      expect(calculateSpread(bid, ask)).toBe('10.00');
    });
  });

  describe('formatSignature', () => {
    it('should truncate signature to first and last 8 chars', () => {
      const sig = '5Z6sRxvLqH8eGpDkHqL5Z6sRxvLqH8eGpDkHqL5Z6sRxvLqH8eGpDkHqL';
      expect(formatSignature(sig)).toBe('5Z6sRxvL...eGpDkHqL');
    });
  });

  describe('formatPublicKey', () => {
    it('should truncate pubkey to first and last 8 chars', () => {
      const pubkey = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
      expect(formatPublicKey(pubkey)).toBe('EPjFWdd5...ZwyTDt1v');
    });
  });

  describe('getExplorerUrl', () => {
    it('should generate devnet explorer URL', () => {
      const sig = 'abc123';
      expect(getExplorerUrl(sig, 'devnet')).toBe(
        'https://explorer.solana.com/tx/abc123?cluster=devnet'
      );
    });

    it('should generate mainnet explorer URL', () => {
      const sig = 'abc123';
      expect(getExplorerUrl(sig, 'mainnet-beta')).toBe(
        'https://explorer.solana.com/tx/abc123'
      );
    });

    it('should default to devnet', () => {
      const sig = 'abc123';
      expect(getExplorerUrl(sig)).toBe(
        'https://explorer.solana.com/tx/abc123?cluster=devnet'
      );
    });
  });
});
