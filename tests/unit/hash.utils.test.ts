import { computeContentHash, verifyContentHash } from '@/utils/hash.utils';

describe('Content Hash Utils', () => {
  describe('computeContentHash', () => {
    it('should generate SHA256 hash', () => {
      const data = { sensor: 'NO2', value: 10 };
      const hash = computeContentHash(data);

      expect(hash).toBeDefined();
      expect(hash).toHaveLength(64); // SHA256 = 64 hex chars
      expect(/^[a-f0-9]{64}$/.test(hash)).toBe(true);
    });

    it('should return same hash for same data', () => {
      const data = { sensor: 'NO2', value: 10, readings: [1, 2, 3] };
      const hash1 = computeContentHash(data);
      const hash2 = computeContentHash(data);

      expect(hash1).toBe(hash2);
    });

    it('should return different hash for different data', () => {
      const data1 = { sensor: 'NO2', value: 10 };
      const data2 = { sensor: 'NO2', value: 12 };
      
      const hash1 = computeContentHash(data1);
      const hash2 = computeContentHash(data2);

      expect(hash1).not.toBe(hash2);
    });

    it('should normalize JSON key order', () => {
      const data1 = { b: 2, a: 1, c: 3 };
      const data2 = { a: 1, b: 2, c: 3 };
      const data3 = { c: 3, b: 2, a: 1 };
      
      const hash1 = computeContentHash(data1);
      const hash2 = computeContentHash(data2);
      const hash3 = computeContentHash(data3);

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it('should handle nested objects', () => {
      const data = {
        sensor: 'NO2',
        metadata: {
          location: 'Delhi',
          station: 'Station 1'
        }
      };
      const hash = computeContentHash(data);

      expect(hash).toBeDefined();
      expect(hash).toHaveLength(64);
    });

    it('should handle arrays', () => {
      const data = {
        sensor: 'NO2',
        values: [10, 12, 15, 13]
      };
      const hash = computeContentHash(data);

      expect(hash).toBeDefined();
      expect(hash).toHaveLength(64);
    });
  });

  describe('verifyContentHash', () => {
    it('should verify correct hash', () => {
      const data = { sensor: 'NO2', value: 10 };
      const hash = computeContentHash(data);
      
      const isValid = verifyContentHash(data, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect hash', () => {
      const data = { sensor: 'NO2', value: 10 };
      const wrongHash = 'a'.repeat(64);
      
      const isValid = verifyContentHash(data, wrongHash);
      expect(isValid).toBe(false);
    });

    it('should detect data tampering', () => {
      const originalData = { sensor: 'NO2', value: 10 };
      const hash = computeContentHash(originalData);
      
      const tamperedData = { sensor: 'NO2', value: 12 };
      const isValid = verifyContentHash(tamperedData, hash);

      expect(isValid).toBe(false);
    });
  });
});
