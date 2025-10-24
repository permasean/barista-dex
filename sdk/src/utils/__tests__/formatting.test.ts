import BN from 'bn.js';
import {
  formatAmount,
  parseAmount,
  formatHealth,
  formatPrice,
  truncatePubkey,
  formatTimestamp,
  formatUsd,
  toBasisPoints,
  formatBasisPoints,
} from '../formatting';

describe('Formatting Utils', () => {
  describe('formatAmount', () => {
    it('should format amount with decimals', () => {
      const amount = new BN(1500000);
      expect(formatAmount(amount, 6)).toBe('1.500000');
    });

    it('should handle zero', () => {
      const amount = new BN(0);
      expect(formatAmount(amount, 6)).toBe('0.000000');
    });

    it('should handle large amounts', () => {
      const amount = new BN('1000000000000'); // 1M with 6 decimals
      expect(formatAmount(amount, 6)).toBe('1000000.000000');
    });

    it('should handle small amounts', () => {
      const amount = new BN(1);
      expect(formatAmount(amount, 6)).toBe('0.000001');
    });
  });

  describe('parseAmount', () => {
    it('should parse amount with decimals', () => {
      const result = parseAmount('1.5', 6);
      expect(result.eq(new BN(1500000))).toBe(true);
    });

    it('should parse integer amount', () => {
      const result = parseAmount('100', 6);
      expect(result.eq(new BN(100000000))).toBe(true);
    });

    it('should handle zero', () => {
      const result = parseAmount('0', 6);
      expect(result.eq(new BN(0))).toBe(true);
    });

    it('should truncate extra decimals', () => {
      const result = parseAmount('1.123456789', 6);
      expect(result.eq(new BN(1123456))).toBe(true);
    });

    it('should pad missing decimals', () => {
      const result = parseAmount('1.5', 6);
      expect(result.eq(new BN(1500000))).toBe(true);
    });
  });

  describe('formatAmount and parseAmount round-trip', () => {
    it('should round-trip correctly', () => {
      const original = '1.234567';
      const parsed = parseAmount(original, 6);
      const formatted = formatAmount(parsed, 6);
      expect(formatted).toBe('1.234567');
    });
  });

  describe('formatHealth', () => {
    it('should format health as percentage', () => {
      const health = new BN(105000000); // 105% (1e6 scale, so 105 * 1e6)
      expect(formatHealth(health)).toBe('105.00%');
    });

    it('should format 100% correctly', () => {
      const health = new BN(100000000); // 100% (1e6 scale)
      expect(formatHealth(health)).toBe('100.00%');
    });

    it('should format below 100% correctly', () => {
      const health = new BN(95000000); // 95% (1e6 scale)
      expect(formatHealth(health)).toBe('95.00%');
    });
  });

  describe('formatPrice', () => {
    it('should format price correctly with 8 decimals', () => {
      const price = new BN(50000000); // Price with 8 decimals (8-0=8)
      expect(formatPrice(price, 8, 0)).toBe('0.50000000');
    });

    it('should handle different quote/base decimals', () => {
      const price = new BN(5000); // 50.00 in 8-6=2 decimal format
      expect(formatPrice(price, 8, 6)).toBe('50.00');
    });

    it('should format standard price correctly', () => {
      const price = new BN(5000000000); // 50.00 with quote=8, base=0
      expect(formatPrice(price, 8, 0)).toBe('50.00000000');
    });
  });

  describe('truncatePubkey', () => {
    it('should truncate long pubkey', () => {
      const pubkey = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
      expect(truncatePubkey(pubkey, 4)).toBe('9WzD...AWWM');
    });

    it('should not truncate short pubkey', () => {
      const pubkey = 'ABC123';
      expect(truncatePubkey(pubkey, 4)).toBe('ABC123');
    });

    it('should use default length', () => {
      const pubkey = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
      expect(truncatePubkey(pubkey)).toBe('9WzD...AWWM');
    });
  });

  describe('formatTimestamp', () => {
    it('should format timestamp to ISO string', () => {
      const timestamp = new BN(1609459200); // 2021-01-01 00:00:00 UTC
      const result = formatTimestamp(timestamp);
      expect(result).toBe('2021-01-01T00:00:00.000Z');
    });
  });

  describe('formatUsd', () => {
    it('should format USD value', () => {
      const value = new BN(1500000); // $1.50
      expect(formatUsd(value)).toBe('$1.500000');
    });

    it('should format large USD value', () => {
      const value = new BN(1000000000); // $1000
      expect(formatUsd(value)).toBe('$1000.000000');
    });
  });

  describe('toBasisPoints', () => {
    it('should convert to basis points', () => {
      expect(toBasisPoints(0.05)).toBe(500); // 5% = 500 bps
    });

    it('should handle 1%', () => {
      expect(toBasisPoints(0.01)).toBe(100);
    });

    it('should handle 0.01%', () => {
      expect(toBasisPoints(0.0001)).toBe(1);
    });
  });

  describe('formatBasisPoints', () => {
    it('should format basis points as percentage', () => {
      expect(formatBasisPoints(500)).toBe('5.00%');
    });

    it('should format 100 bps as 1%', () => {
      expect(formatBasisPoints(100)).toBe('1.00%');
    });

    it('should format 1 bp as 0.01%', () => {
      expect(formatBasisPoints(1)).toBe('0.01%');
    });
  });
});
