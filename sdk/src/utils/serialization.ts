import BN from 'bn.js';
import { PublicKey } from '@solana/web3.js';

/**
 * Serialize a u32 (4 bytes, little-endian)
 */
export function serializeU32(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value);
  return buf;
}

/**
 * Serialize a u64 (8 bytes, little-endian)
 */
export function serializeU64(value: BN | number): Buffer {
  const bn = new BN(value);
  const buf = Buffer.alloc(8);
  bn.toArrayLike(Buffer, 'le', 8).copy(buf);
  return buf;
}

/**
 * Serialize a u128 (16 bytes, little-endian)
 */
export function serializeU128(value: BN | number): Buffer {
  const bn = new BN(value);
  const buf = Buffer.alloc(16);
  bn.toArrayLike(Buffer, 'le', 16).copy(buf);
  return buf;
}

/**
 * Serialize an i64 (8 bytes, little-endian, two's complement)
 */
export function serializeI64(value: BN | number): Buffer {
  const bn = new BN(value);
  const buf = Buffer.alloc(8);

  if (bn.isNeg()) {
    // Two's complement for negative numbers
    const positive = bn.abs();
    const complement = new BN(1).shln(64).sub(positive);
    complement.toArrayLike(Buffer, 'le', 8).copy(buf);
  } else {
    bn.toArrayLike(Buffer, 'le', 8).copy(buf);
  }

  return buf;
}

/**
 * Serialize a boolean (1 byte)
 */
export function serializeBool(value: boolean): Buffer {
  return Buffer.from([value ? 1 : 0]);
}

/**
 * Serialize a PublicKey (32 bytes)
 */
export function serializePubkey(pubkey: PublicKey): Buffer {
  return pubkey.toBuffer();
}

/**
 * Deserialize a u64 (8 bytes, little-endian)
 */
export function deserializeU64(buffer: Buffer, offset: number = 0): BN {
  return new BN(buffer.slice(offset, offset + 8), 'le');
}

/**
 * Deserialize a u128 (16 bytes, little-endian)
 */
export function deserializeU128(buffer: Buffer, offset: number = 0): BN {
  return new BN(buffer.slice(offset, offset + 16), 'le');
}

/**
 * Deserialize an i64 (8 bytes, little-endian, two's complement)
 */
export function deserializeI64(buffer: Buffer, offset: number = 0): BN {
  const bytes = buffer.slice(offset, offset + 8);
  const value = new BN(bytes, 'le');

  // Check if negative (sign bit set)
  if (bytes[7] & 0x80) {
    // Convert from two's complement
    return value.sub(new BN(1).shln(64));
  }

  return value;
}

/**
 * Deserialize a boolean (1 byte)
 */
export function deserializeBool(buffer: Buffer, offset: number = 0): boolean {
  return buffer[offset] !== 0;
}

/**
 * Deserialize a PublicKey (32 bytes)
 */
export function deserializePubkey(buffer: Buffer, offset: number = 0): PublicKey {
  return new PublicKey(buffer.slice(offset, offset + 32));
}

/**
 * Create instruction data buffer with discriminator
 */
export function createInstructionData(discriminator: number, ...parts: Buffer[]): Buffer {
  const discBuf = Buffer.from([discriminator]);
  return Buffer.concat([discBuf, ...parts]);
}
