import { PublicKey } from '@solana/web3.js';

/**
 * Cluster/Network configuration
 */
export type Cluster = 'devnet' | 'mainnet-beta' | 'localnet';

/**
 * RPC endpoints for each cluster
 */
export const RPC_ENDPOINTS: Record<Cluster, string> = {
  devnet: 'https://api.devnet.solana.com',
  'mainnet-beta': 'https://api.mainnet-beta.solana.com',
  localnet: 'http://localhost:8899',
};

/**
 * Program IDs for Router program across different clusters
 */
export const ROUTER_PROGRAM_IDS: Record<Cluster, PublicKey> = {
  devnet: new PublicKey('RoutR1VdCpHqj89WEMJhb6TkGT9cPfr1rVjhM3e2YQr'), // Replace with actual devnet program ID
  'mainnet-beta': new PublicKey('RoutR1VdCpHqj89WEMJhb6TkGT9cPfr1rVjhM3e2YQr'), // Replace with actual mainnet program ID
  localnet: new PublicKey('RoutR1VdCpHqj89WEMJhb6TkGT9cPfr1rVjhM3e2YQr'), // Replace with actual localnet program ID
};

/**
 * Program IDs for Slab program across different clusters
 */
export const SLAB_PROGRAM_IDS: Record<Cluster, PublicKey> = {
  devnet: new PublicKey('SLaBZ6PsDLh2X6HzEoqxFDMqCVcJXDKCNEYuPzUvGPk'), // Replace with actual devnet program ID
  'mainnet-beta': new PublicKey('SLaBZ6PsDLh2X6HzEoqxFDMqCVcJXDKCNEYuPzUvGPk'), // Replace with actual mainnet program ID
  localnet: new PublicKey('SLaBZ6PsDLh2X6HzEoqxFDMqCVcJXDKCNEYuPzUvGPk'), // Replace with actual localnet program ID
};

/**
 * Get program IDs for a specific cluster
 */
export function getProgramIds(cluster: Cluster) {
  return {
    router: ROUTER_PROGRAM_IDS[cluster],
    slab: SLAB_PROGRAM_IDS[cluster],
  };
}

/**
 * Get RPC endpoint for a specific cluster
 */
export function getRpcEndpoint(cluster: Cluster): string {
  return RPC_ENDPOINTS[cluster];
}
