import { MerkleTree } from 'merkletreejs';
import crypto from 'crypto';

/**
 * Generate a leaf node hash for a sensor reading
 * Format: hash(sensor_type + value + timestamp + index)
 */
export function generateLeafHash(
  sensorType: string,
  value: number,
  timestamp: Date,
  index: number
): string {
  const data = `${sensorType}:${value}:${timestamp.toISOString()}:${index}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Build a Merkle tree from sensor data and return the root hash
 * @param sensorData - Object with sensor types as keys and arrays of values
 * @param timestamps - Array of timestamps for each reading (optional, uses current time if not provided)
 * @returns Merkle root hash as hex string
 */
export function buildMerkleTree(
  sensorData: Record<string, number[]>,
  timestamps?: Date[]
): { root: string; tree: MerkleTree; leaves: string[] } {
  const leaves: string[] = [];
  let readingIndex = 0;

  // Generate leaf hashes for all sensor readings
  for (const [sensorType, values] of Object.entries(sensorData)) {
    if (!Array.isArray(values)) continue;

    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      const timestamp = timestamps?.[readingIndex] || new Date();
      const leafHash = generateLeafHash(sensorType, value, timestamp, readingIndex);
      leaves.push(leafHash);
      readingIndex++;
    }
  }

  // Handle edge case: no leaves
  if (leaves.length === 0) {
    throw new Error('No sensor data to build Merkle tree');
  }

  // Pad to power of 2 if needed (duplicate last leaf)
  const targetSize = Math.pow(2, Math.ceil(Math.log2(leaves.length)));
  while (leaves.length < targetSize) {
    leaves.push(leaves[leaves.length - 1]);
  }

  // Build Merkle tree with SHA256 hash function
  const tree = new MerkleTree(leaves, (data: Buffer | string) => {
    return crypto.createHash('sha256').update(data).digest();
  }, {
    sortPairs: true,
    hashLeaves: false // We've already hashed the leaves
  });

  const root = tree.getRoot().toString('hex');

  return { root, tree, leaves };
}

/**
 * Verify a Merkle proof for a specific reading
 * @param leaf - The leaf hash to verify
 * @param proof - Array of sibling hashes
 * @param root - The Merkle root
 * @returns true if proof is valid
 */
export function verifyMerkleProof(
  leaf: string,
  proof: string[],
  root: string
): boolean {
  const proofBuffers = proof.map(p => Buffer.from(p, 'hex'));
  const leafBuffer = Buffer.from(leaf, 'hex');
  const rootBuffer = Buffer.from(root, 'hex');

  return MerkleTree.verify(
    proofBuffers,
    leafBuffer,
    rootBuffer,
    (data: Buffer | string) => crypto.createHash('sha256').update(data).digest(),
    { sortPairs: true }
  );
}

/**
 * Get Merkle proof for a specific leaf index
 */
export function getMerkleProof(tree: MerkleTree, leafIndex: number): string[] {
  const leaves = tree.getLeaves();
  if (leafIndex >= leaves.length) {
    throw new Error('Leaf index out of bounds');
  }

  const proof = tree.getProof(leaves[leafIndex]);
  return proof.map(p => p.data.toString('hex'));
}
