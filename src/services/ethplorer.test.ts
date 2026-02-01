import { describe, it, expect } from 'vitest';
import { isValidEthereumAddress } from './ethplorer';

describe('ethplorer', () => {
  describe('isValidEthereumAddress', () => {
    it('accepts valid lowercase 0x + 40 hex', () => {
      expect(isValidEthereumAddress('0x' + 'a'.repeat(40))).toBe(true);
    });

    it('accepts valid mixed case 0x + 40 hex', () => {
      expect(isValidEthereumAddress('0x742d35Cc6634C0532925a3b844Bc454e4438f44e')).toBe(true);
    });

    it('rejects empty string', () => {
      expect(isValidEthereumAddress('')).toBe(false);
    });

    it('rejects without 0x prefix', () => {
      expect(isValidEthereumAddress('742d35cc6634c0532925a3b844bc454e4438f44e')).toBe(false);
    });

    it('rejects wrong length (too short)', () => {
      expect(isValidEthereumAddress('0x1234')).toBe(false);
    });

    it('rejects wrong length (too long)', () => {
      expect(isValidEthereumAddress('0x' + 'a'.repeat(41))).toBe(false);
    });

    it('rejects non-hex characters', () => {
      expect(isValidEthereumAddress('0x742d35cc6634c0532925a3b844bc454e4438f44g')).toBe(false);
    });

    it('trims whitespace', () => {
      expect(isValidEthereumAddress('  0x' + 'a'.repeat(40) + '  ')).toBe(true);
    });
  });
});
