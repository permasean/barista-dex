import { Keypair } from '@solana/web3.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Load a Solana keypair from a file path
 * Supports both JSON array format and base58 string
 */
export function loadKeypair(keypairPath: string): Keypair {
  const expanded = keypairPath.replace(/^~/, os.homedir());

  if (!fs.existsSync(expanded)) {
    throw new Error(`Keypair file not found: ${expanded}`);
  }

  const secretKeyString = fs.readFileSync(expanded, 'utf-8');

  try {
    const secretKey = JSON.parse(secretKeyString);
    return Keypair.fromSecretKey(Uint8Array.from(secretKey));
  } catch (e) {
    throw new Error(`Failed to parse keypair from ${expanded}: ${e}`);
  }
}

/**
 * Load Barista CLI configuration from ~/.barista/config.json
 */
export interface BaristaConfig {
  routerProgramId: string;
  slabProgramId: string;
  rpcUrl?: string;
  network?: 'devnet' | 'mainnet-beta' | 'localhost';
}

export function loadConfig(): BaristaConfig {
  const configPath = path.join(os.homedir(), '.barista', 'config.json');

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Configuration file not found at ${configPath}.\n` +
      `Please create a config file with the following structure:\n` +
      `{\n` +
      `  "routerProgramId": "your-router-program-id",\n` +
      `  "slabProgramId": "your-slab-program-id",\n` +
      `  "rpcUrl": "https://api.devnet.solana.com",\n` +
      `  "network": "devnet"\n` +
      `}`
    );
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    if (!config.routerProgramId || !config.slabProgramId) {
      throw new Error('Config must contain routerProgramId and slabProgramId');
    }

    return config;
  } catch (e) {
    throw new Error(`Failed to parse config from ${configPath}: ${e}`);
  }
}

/**
 * Get default keypair path
 */
export function getDefaultKeypairPath(): string {
  return path.join(os.homedir(), '.config', 'solana', 'id.json');
}
