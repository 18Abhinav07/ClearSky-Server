import crypto from 'crypto';

/**
 * Compute SHA256 hash of a JSON payload
 * Normalizes the JSON to ensure deterministic hashing
 * @param payload - Any JSON-serializable object
 * @returns SHA256 hash as hex string
 */
export function computeContentHash(payload: any): string {
  // Sort keys recursively for deterministic hashing
  const normalized = normalizeJSON(payload);
  const jsonString = JSON.stringify(normalized);
  return crypto.createHash('sha256').update(jsonString).digest('hex');
}

/**
 * Normalize JSON by sorting keys recursively
 * Ensures same data produces same hash regardless of key order
 */
function normalizeJSON(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(normalizeJSON);
  }

  const sorted: Record<string, any> = {};
  Object.keys(obj)
    .sort()
    .forEach(key => {
      sorted[key] = normalizeJSON(obj[key]);
    });

  return sorted;
}

/**
 * Verify content hash matches the payload
 * @param payload - The data to verify
 * @param expectedHash - The expected hash value
 * @returns true if hash matches
 */
export function verifyContentHash(payload: any, expectedHash: string): boolean {
  const actualHash = computeContentHash(payload);
  return actualHash === expectedHash;
}

/**
 * Compute SHA256 hash of a simple string.
 * @param content - The string content to hash.
 * @returns SHA256 hash as hex string.
 */
export const getDeterministicContentHash = (content: string): string => {
  return crypto.createHash('sha256').update(content).digest('hex');
};
