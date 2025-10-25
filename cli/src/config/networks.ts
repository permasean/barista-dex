import { PublicKey } from '@solana/web3.js';

/**
 * Network-specific configuration for Barista DEX
 */
export interface NetworkConfig {
  routerProgramId: PublicKey;
  slabProgramId: PublicKey;
  rpcUrl: string;
}

/**
 * Supported networks
 */
export type NetworkName = 'mainnet-beta' | 'devnet' | 'localnet';

/**
 * Network configurations with hardcoded program IDs
 * TODO: Update with actual deployed program IDs after deployment
 */
export const NETWORK_CONFIGS: Record<NetworkName, NetworkConfig> = {
  'mainnet-beta': {
    // TODO: Replace with actual mainnet-beta deployed program IDs
    routerProgramId: new PublicKey('RoutR1VdCpHqj89WEMJhb6TkGT9cPfr1rVjhM3e2YQr'),
    slabProgramId: new PublicKey('SLabZ6PsDLh2X6HzEoqxFDMqCVcJXDKCNEYuPzUvGPk'),
    rpcUrl: 'https://api.mainnet-beta.solana.com',
  },
  'devnet': {
    // TODO: Replace with actual devnet deployed program IDs
    routerProgramId: new PublicKey('RoutR1VdCpHqj89WEMJhb6TkGT9cPfr1rVjhM3e2YQr'),
    slabProgramId: new PublicKey('SLabZ6PsDLh2X6HzEoqxFDMqCVcJXDKCNEYuPzUvGPk'),
    rpcUrl: 'https://api.devnet.solana.com',
  },
  'localnet': {
    // TODO: Replace with actual localnet deployed program IDs
    routerProgramId: new PublicKey('RoutR1VdCpHqj89WEMJhb6TkGT9cPfr1rVjhM3e2YQr'),
    slabProgramId: new PublicKey('SLabZ6PsDLh2X6HzEoqxFDMqCVcJXDKCNEYuPzUvGPk'),
    rpcUrl: 'http://localhost:8899',
  },
};

/**
 * Get network configuration with environment variable overrides
 *
 * Environment variables:
 * - BARISTA_NETWORK: Network name (mainnet-beta, devnet, localnet)
 * - BARISTA_RPC_URL: Custom RPC URL (overrides network default)
 * - BARISTA_ROUTER_PROGRAM: Custom router program ID
 * - BARISTA_SLAB_PROGRAM: Custom slab program ID
 *
 * @param networkName Network name (defaults to mainnet-beta)
 * @returns Network configuration with any env var overrides applied
 */
export function getNetworkConfig(networkName?: string): NetworkConfig {
  const network = (networkName || process.env.BARISTA_NETWORK || 'mainnet-beta') as NetworkName;

  if (!NETWORK_CONFIGS[network]) {
    throw new Error(
      `Invalid network: ${network}. Must be one of: mainnet-beta, devnet, localnet`
    );
  }

  const config = { ...NETWORK_CONFIGS[network] };

  // Apply environment variable overrides
  if (process.env.BARISTA_RPC_URL) {
    config.rpcUrl = process.env.BARISTA_RPC_URL;
  }

  if (process.env.BARISTA_ROUTER_PROGRAM) {
    config.routerProgramId = new PublicKey(process.env.BARISTA_ROUTER_PROGRAM);
  }

  if (process.env.BARISTA_SLAB_PROGRAM) {
    config.slabProgramId = new PublicKey(process.env.BARISTA_SLAB_PROGRAM);
  }

  return config;
}

/**
 * Get default keypair path
 * Checks BARISTA_KEYPAIR env var, falls back to ~/.config/solana/id.json
 */
export function getDefaultKeypairPath(): string {
  return process.env.BARISTA_KEYPAIR || `${process.env.HOME}/.config/solana/id.json`;
}
