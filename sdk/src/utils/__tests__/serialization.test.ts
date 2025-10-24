import BN from 'bn.js';
import { PublicKey } from '@solana/web3.js';
import {
  serializeU32,
  serializeU64,
  serializeU128,
  serializeI64,
  serializeBool,
  serializePubkey,
  deserializeU64,
  deserializeU128,
  deserializeI64,
  deserializeBool,
  deserializePubkey,
  createInstructionData,
} from '../serialization';

describe('Serialization Utils', () => {
  describe('serializeU32', () => {
    it('should serialize u32 correctly', () => {
      const result = serializeU32(12345);
      expect(result.length).toBe(4);
      expect(result.readUInt32LE(0)).toBe(12345);
    });

    it('should handle max u32', () => {
      const max = 0xFFFFFFFF;
      const result = serializeU32(max);
      expect(result.readUInt32LE(0)).toBe(max);
    });
  });

  describe('serializeU64 / deserializeU64', () => {
    it('should serialize and deserialize u64 correctly', () => {
      const value = new BN('1000000000000');
      const serialized = serializeU64(value);
      expect(serialized.length).toBe(8);

      const deserialized = deserializeU64(serialized);
      expect(deserialized.eq(value)).toBe(true);
    });

    it('should handle zero', () => {
      const value = new BN(0);
      const serialized = serializeU64(value);
      const deserialized = deserializeU64(serialized);
      expect(deserialized.eq(value)).toBe(true);
    });

    it('should handle max u64', () => {
      const value = new BN('18446744073709551615'); // 2^64 - 1
      const serialized = serializeU64(value);
      const deserialized = deserializeU64(serialized);
      expect(deserialized.eq(value)).toBe(true);
    });
  });

  describe('serializeU128 / deserializeU128', () => {
    it('should serialize and deserialize u128 correctly', () => {
      const value = new BN('1000000000000000000');
      const serialized = serializeU128(value);
      expect(serialized.length).toBe(16);

      const deserialized = deserializeU128(serialized);
      expect(deserialized.eq(value)).toBe(true);
    });

    it('should handle small values', () => {
      const value = new BN(123);
      const serialized = serializeU128(value);
      const deserialized = deserializeU128(serialized);
      expect(deserialized.eq(value)).toBe(true);
    });
  });

  describe('serializeI64 / deserializeI64', () => {
    it('should serialize and deserialize positive i64', () => {
      const value = new BN(1000000);
      const serialized = serializeI64(value);
      expect(serialized.length).toBe(8);

      const deserialized = deserializeI64(serialized);
      expect(deserialized.eq(value)).toBe(true);
    });

    it('should serialize and deserialize negative i64', () => {
      const value = new BN(-1000000);
      const serialized = serializeI64(value);

      const deserialized = deserializeI64(serialized);
      expect(deserialized.eq(value)).toBe(true);
    });

    it('should handle zero', () => {
      const value = new BN(0);
      const serialized = serializeI64(value);
      const deserialized = deserializeI64(serialized);
      expect(deserialized.eq(value)).toBe(true);
    });

    it('should handle -1', () => {
      const value = new BN(-1);
      const serialized = serializeI64(value);
      const deserialized = deserializeI64(serialized);
      expect(deserialized.eq(value)).toBe(true);
    });
  });

  describe('serializeBool / deserializeBool', () => {
    it('should serialize true correctly', () => {
      const result = serializeBool(true);
      expect(result.length).toBe(1);
      expect(result[0]).toBe(1);
    });

    it('should serialize false correctly', () => {
      const result = serializeBool(false);
      expect(result.length).toBe(1);
      expect(result[0]).toBe(0);
    });

    it('should deserialize true correctly', () => {
      const buffer = Buffer.from([1]);
      expect(deserializeBool(buffer)).toBe(true);
    });

    it('should deserialize false correctly', () => {
      const buffer = Buffer.from([0]);
      expect(deserializeBool(buffer)).toBe(false);
    });
  });

  describe('serializePubkey / deserializePubkey', () => {
    it('should serialize and deserialize pubkey correctly', () => {
      const pubkey = new PublicKey('11111111111111111111111111111111');
      const serialized = serializePubkey(pubkey);
      expect(serialized.length).toBe(32);

      const deserialized = deserializePubkey(serialized);
      expect(deserialized.equals(pubkey)).toBe(true);
    });

    it('should handle random pubkey', () => {
      const pubkey = PublicKey.unique();
      const serialized = serializePubkey(pubkey);
      const deserialized = deserializePubkey(serialized);
      expect(deserialized.equals(pubkey)).toBe(true);
    });
  });

  describe('createInstructionData', () => {
    it('should create instruction data with discriminator only', () => {
      const result = createInstructionData(5);
      expect(result.length).toBe(1);
      expect(result[0]).toBe(5);
    });

    it('should create instruction data with discriminator and parts', () => {
      const part1 = Buffer.from([1, 2, 3]);
      const part2 = Buffer.from([4, 5, 6]);
      const result = createInstructionData(7, part1, part2);

      expect(result.length).toBe(7); // 1 (discriminator) + 3 + 3
      expect(result[0]).toBe(7);
      expect(result.slice(1, 4)).toEqual(part1);
      expect(result.slice(4, 7)).toEqual(part2);
    });
  });
});
