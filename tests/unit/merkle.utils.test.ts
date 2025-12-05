import { buildMerkleTree, generateLeafHash, verifyMerkleProof, getMerkleProof } from '@/utils/merkle.utils';

describe('Merkle Tree Utils', () => {
  describe('generateLeafHash', () => {
    it('should generate deterministic hash for same input', () => {
      const timestamp = new Date('2024-12-04T15:10:00Z');
      const hash1 = generateLeafHash('NO2', 10, timestamp, 0);
      const hash2 = generateLeafHash('NO2', 10, timestamp, 0);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA256 = 64 hex chars
    });

    it('should generate different hash for different values', () => {
      const timestamp = new Date('2024-12-04T15:10:00Z');
      const hash1 = generateLeafHash('NO2', 10, timestamp, 0);
      const hash2 = generateLeafHash('NO2', 12, timestamp, 0);
      
      expect(hash1).not.toBe(hash2);
    });

    it('should generate different hash for different indices', () => {
      const timestamp = new Date('2024-12-04T15:10:00Z');
      const hash1 = generateLeafHash('NO2', 10, timestamp, 0);
      const hash2 = generateLeafHash('NO2', 10, timestamp, 1);
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('buildMerkleTree', () => {
    it('should build tree and return root for sensor data', () => {
      const sensorData = {
        'NO2': [10, 12, 15],
        'PM2.5': [35, 38, 36]
      };

      const { root, tree, leaves } = buildMerkleTree(sensorData);

      expect(root).toBeDefined();
      expect(root).toHaveLength(64);
      expect(leaves).toHaveLength(8); // Padded to power of 2 (6 → 8)
      expect(tree).toBeDefined();
    });

    it('should return same root for same data', () => {
      const sensorData = {
        'NO2': [10, 12],
        'PM2.5': [35, 38]
      };

      const { root: root1 } = buildMerkleTree(sensorData);
      const { root: root2 } = buildMerkleTree(sensorData);

      expect(root1).toBe(root2);
    });

    it('should return different root for different data', () => {
      const sensorData1 = { 'NO2': [10, 12] };
      const sensorData2 = { 'NO2': [10, 13] };

      const { root: root1 } = buildMerkleTree(sensorData1);
      const { root: root2 } = buildMerkleTree(sensorData2);

      expect(root1).not.toBe(root2);
    });

    it('should handle single sensor reading', () => {
      const sensorData = { 'NO2': [10] };
      const { root, leaves } = buildMerkleTree(sensorData);

      expect(root).toBeDefined();
      expect(leaves).toHaveLength(1);
    });

    it('should throw error for empty sensor data', () => {
      expect(() => buildMerkleTree({})).toThrow('No sensor data to build Merkle tree');
    });
  });

  describe('Merkle Proof Verification', () => {
    it('should generate and verify valid proof', () => {
      const sensorData = {
        'NO2': [10, 12],
        'PM2.5': [35, 38]
      };

      const { root, tree, leaves } = buildMerkleTree(sensorData);
      const proof = getMerkleProof(tree, 0);

      const isValid = verifyMerkleProof(leaves[0], proof, root);
      expect(isValid).toBe(true);
    });

    it('should reject invalid proof', () => {
      const sensorData = { 'NO2': [10, 12, 15, 13] };
      const { root, tree, leaves } = buildMerkleTree(sensorData);
      
      // Get proof for leaf 0 but verify against leaf 1
      const proof = getMerkleProof(tree, 0);
      const isValid = verifyMerkleProof(leaves[1], proof, root);

      expect(isValid).toBe(false);
    });
  });
});
