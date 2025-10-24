import fs from 'fs';
import os from 'os';
import path from 'path';
import { Keypair } from '@solana/web3.js';
import { loadKeypair, loadConfig, getDefaultKeypairPath } from '../../utils/wallet';

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

  describe('loadConfig', () => {
    const validConfig = {
      routerProgramId: 'RoutR1VdCpHqj89WEMJhb6TkGT9cPfr1rVjhM3e2YQr',
      slabProgramId: 'SLaBZ6PsDLh2X6HzEoqxFDMqCVcJXDKCNEYuPzUvGPk',
      rpcUrl: 'https://api.devnet.solana.com',
      network: 'devnet',
    };

    it('should load valid config file', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(validConfig));

      const config = loadConfig();

      expect(config).toEqual(validConfig);
      expect(mockFs.existsSync).toHaveBeenCalledWith(
        '/home/test/.barista/config.json'
      );
    });

    it('should throw error if config file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      expect(() => loadConfig()).toThrow('Configuration file not found');
    });

    it('should throw error if missing required fields', () => {
      const invalidConfig = {
        rpcUrl: 'https://api.devnet.solana.com',
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      expect(() => loadConfig()).toThrow(
        'Config must contain routerProgramId and slabProgramId'
      );
    });

    it('should throw error on invalid JSON', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid json');

      expect(() => loadConfig()).toThrow('Failed to parse config');
    });
  });
});
