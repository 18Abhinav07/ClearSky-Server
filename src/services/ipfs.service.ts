import pinataSDK from '@pinata/sdk';
import { logger } from '@/utils/logger';

let pinataClient: any = null;

/**
 * Initialize Pinata client
 */
export function initializePinata(): void {
  const pinataJWT = process.env.PINATA_JWT;

  if (!pinataJWT) {
    throw new Error('PINATA_JWT environment variable is required');
  }

  pinataClient = new pinataSDK({ pinataJWTKey: pinataJWT });
  logger.info('Pinata client initialized');
}

/**
 * Get Pinata client instance
 */
function getPinataClient(): any {
  if (!pinataClient) {
    initializePinata();
  }
  return pinataClient;
}

/**
 * Pin JSON metadata to IPFS via Pinata
 * @param metadata - JSON object to pin
 * @param options - Pinata pinning options (name, keyvalues)
 * @returns IPFS hash and URI
 */
export async function pinJSONToIPFS(
  metadata: any,
  options?: {
    name?: string;
    keyvalues?: Record<string, string | number>;
  }
): Promise<{ ipfsHash: string; ipfsUri: string; pinSize: number }> {
  const client = getPinataClient();

  const pinataMetadata = {
    name: options?.name || `clearsky-batch-${Date.now()}`,
    keyvalues: options?.keyvalues || {}
  };

  const pinataOptions = {
    pinataMetadata,
    pinataOptions: {
      cidVersion: 1
    }
  };

  try {
    logger.info('Pinning JSON to IPFS via Pinata', {
      name: pinataMetadata.name,
      size: JSON.stringify(metadata).length
    });

    const result = await client.pinJSONToIPFS(metadata, pinataOptions);

    const ipfsHash = result.IpfsHash;
    const ipfsUri = `ipfs://${ipfsHash}`;

    logger.info('Successfully pinned to IPFS', {
      ipfsHash,
      pinSize: result.PinSize,
      timestamp: result.Timestamp
    });

    return {
      ipfsHash,
      ipfsUri,
      pinSize: result.PinSize
    };
  } catch (error) {
    logger.error('Failed to pin JSON to IPFS', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Unpin content from IPFS (for cleanup/testing)
 * @param ipfsHash - The IPFS hash to unpin
 */
export async function unpinFromIPFS(ipfsHash: string): Promise<void> {
  const client = getPinataClient();

  try {
    await client.unpin(ipfsHash);
    logger.info('Successfully unpinned from IPFS', { ipfsHash });
  } catch (error) {
    logger.error('Failed to unpin from IPFS', {
      ipfsHash,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Get gateway URL for an IPFS hash
 * @param ipfsHash - The IPFS hash
 * @returns HTTP gateway URL
 */
export function getIPFSGatewayURL(ipfsHash: string): string {
  const gatewayBase = process.env.IPFS_GATEWAY_URL || 'https://gateway.pinata.cloud';
  return `${gatewayBase}/ipfs/${ipfsHash}`;
}

/**
 * Test Pinata connection
 */
export async function testPinataConnection(): Promise<boolean> {
  const client = getPinataClient();

  try {
    await client.testAuthentication();
    logger.info('Pinata connection test successful');
    return true;
  } catch (error) {
    logger.error('Pinata connection test failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return false;
  }
}
