import fs from 'fs';
import os from 'os';
import path from 'path';
import { Keypair } from '@solana/web3.js';
import { loadKeypair, getConfig, getDefaultKeypairPath } from '../../utils/wallet';

// Mock fs module
jest.mock('fs');
jest.mock('os');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockOs = os as jest.Mocked<typeof os>;

describe('Wallet Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOs.homedir.mockReturnValue('/home/test');
  });

  describe('getDefaultKeypairPath', () => {
    it('should return default solana keypair path', () => {
      const defaultPath = getDefaultKeypairPath();
      expect(defaultPath).toBe('/home/test/.config/solana/id.json');
    });
  });

  describe('loadKeypair', () => {
    it('should load keypair from valid JSON file', () => {
      const mockKeypair = Keypair.generate();
      const secretKey = Array.from(mockKeypair.secretKey);

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(secretKey));

      const keypair = loadKeypair('~/test-keypair.json');

      expect(keypair).toBeInstanceOf(Keypair);
      expect(mockFs.existsSync).toHaveBeenCalledWith('/home/test/test-keypair.json');
    });

    it('should expand tilde in path', () => {
      const mockKeypair = Keypair.generate();
      const secretKey = Array.from(mockKeypair.secretKey);

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(secretKey));

      loadKeypair('~/wallet.json');

      expect(mockFs.existsSync).toHaveBeenCalledWith('/home/test/wallet.json');
    });

    it('should throw error if file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      expect(() => loadKeypair('/path/to/nonexistent.json')).toThrow(
        'Keypair file not found'
      );
    });

    it('should throw error on invalid JSON', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid json');

      expect(() => loadKeypair('/path/to/invalid.json')).toThrow(
        'Failed to parse keypair'
      );
    });
  });

  describe('getConfig', () => {
    beforeEach(() => {
      delete process.env.BARISTA_NETWORK;
      delete process.env.BARISTA_RPC_URL;
    });

    it('should return mainnet-beta config by default', () => {
      const config = getConfig();

      expect(config.cluster).toBe('mainnet-beta');
      expect(config.routerProgramId).toBe('RoutR1VdCpHqj89WEMJhb6TkGT9cPfr1rVjhM3e2YQr');
      expect(config.slabProgramId).toBe('SLaBZ6PsDLh2X6HzEoqxFDMqCVcJXDKCNEYuPzUvGPk');
      expect(config.rpcUrl).toBe('https://api.mainnet-beta.solana.com');
    });

    it('should return devnet config when specified', () => {
      const config = getConfig('devnet');

      expect(config.cluster).toBe('devnet');
      expect(config.routerProgramId).toBe('RoutR1VdCpHqj89WEMJhb6TkGT9cPfr1rVjhM3e2YQr');
      expect(config.slabProgramId).toBe('SLaBZ6PsDLh2X6HzEoqxFDMqCVcJXDKCNEYuPzUvGPk');
      expect(config.rpcUrl).toBe('https://api.devnet.solana.com');
    });

    it('should return localnet config when specified', () => {
      const config = getConfig('localnet');

      expect(config.cluster).toBe('localnet');
      expect(config.routerProgramId).toBe('RoutR1VdCpHqj89WEMJhb6TkGT9cPfr1rVjhM3e2YQr');
      expect(config.slabProgramId).toBe('SLaBZ6PsDLh2X6HzEoqxFDMqCVcJXDKCNEYuPzUvGPk');
      expect(config.rpcUrl).toBe('http://localhost:8899');
    });

    it('should use custom RPC URL when provided', () => {
      const customUrl = 'https://my-custom-rpc.com';
      const config = getConfig('mainnet-beta', customUrl);

      expect(config.cluster).toBe('mainnet-beta');
      expect(config.rpcUrl).toBe(customUrl);
    });

    it('should use BARISTA_NETWORK environment variable', () => {
      process.env.BARISTA_NETWORK = 'devnet';
      const config = getConfig();

      expect(config.cluster).toBe('devnet');
      expect(config.rpcUrl).toBe('https://api.devnet.solana.com');
    });

    it('should use BARISTA_RPC_URL environment variable', () => {
      process.env.BARISTA_RPC_URL = 'https://custom-env-rpc.com';
      const config = getConfig();

      expect(config.rpcUrl).toBe('https://custom-env-rpc.com');
    });

    it('should prioritize CLI flags over environment variables', () => {
      process.env.BARISTA_NETWORK = 'devnet';
      process.env.BARISTA_RPC_URL = 'https://env-rpc.com';

      const config = getConfig('localnet', 'https://cli-rpc.com');

      expect(config.cluster).toBe('localnet');
      expect(config.rpcUrl).toBe('https://cli-rpc.com');
    });

    it('should use env var for network and CLI flag for RPC', () => {
      process.env.BARISTA_NETWORK = 'devnet';
      const config = getConfig(undefined, 'https://custom-rpc.com');

      expect(config.cluster).toBe('devnet');
      expect(config.rpcUrl).toBe('https://custom-rpc.com');
    });
  });

  describe('getDefaultKeypairPath', () => {
    beforeEach(() => {
      delete process.env.BARISTA_KEYPAIR;
    });

    it('should return default Solana keypair path when no env var is set', () => {
      const path = getDefaultKeypairPath();
      expect(path).toBe('/home/test/.config/solana/id.json');
    });

    it('should use BARISTA_KEYPAIR environment variable when set', () => {
      process.env.BARISTA_KEYPAIR = '/custom/path/to/keypair.json';
      const path = getDefaultKeypairPath();
      expect(path).toBe('/custom/path/to/keypair.json');
    });
  });
});
