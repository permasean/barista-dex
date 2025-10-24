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

import { Cluster, getProgramIds, getRpcEndpoint } from '@barista-dex/sdk';

/**
 * Barista CLI configuration
 */
export interface BaristaConfig {
  routerProgramId: string;
  slabProgramId: string;
  rpcUrl: string;
  cluster: Cluster;
}

/**
 * Get configuration for the specified cluster
 * Priority: CLI flags > Environment variables > Defaults
 *
 * Environment variables:
 * - BARISTA_NETWORK: Network to use (mainnet-beta, devnet, localnet)
 * - BARISTA_RPC_URL: Custom RPC endpoint
 */
export function getConfig(cluster?: Cluster, customRpcUrl?: string): BaristaConfig {
  // Priority: CLI flag > env var > default
  const finalCluster = cluster || (process.env.BARISTA_NETWORK as Cluster) || 'mainnet-beta';
  const programIds = getProgramIds(finalCluster);

  // Priority: CLI flag > env var > default RPC for cluster
  const rpcUrl = customRpcUrl || process.env.BARISTA_RPC_URL || getRpcEndpoint(finalCluster);

  return {
    routerProgramId: programIds.router.toBase58(),
    slabProgramId: programIds.slab.toBase58(),
    rpcUrl,
    cluster: finalCluster,
  };
}

/**
 * Get default keypair path
 * Uses BARISTA_KEYPAIR environment variable if set, otherwise falls back to default Solana keypair
 */
export function getDefaultKeypairPath(): string {
  return process.env.BARISTA_KEYPAIR || path.join(os.homedir(), '.config', 'solana', 'id.json');
}
