import { StoryClient, StoryConfig } from '@story-protocol/core-sdk';
import { http, Address, createPublicClient, PublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { STORY_CONFIG } from '../config/constants';
import { logger } from '../utils/logger';
import { IDerivative } from '../types/derivative.types';

// --- Client Initialization ---

let client: StoryClient;
let publicClient: PublicClient;

const getStoryClient = (): StoryClient => {
  if (client) return client;
  if (!STORY_CONFIG.PRIVATE_KEY) throw new Error('STORY_PRIVATE_KEY is not set in your .env file.');
  
  const config: StoryConfig = {
    transport: http(process.env.RPC_PROVIDER_URL || 'https://sepolia.rpc.storyprotocol.net'),
    account: privateKeyToAccount(STORY_CONFIG.PRIVATE_KEY as `0x${string}`),
  };
  client = StoryClient.newClient(config);
  return client;
};

const getPublicClient = (): PublicClient => {
    if (publicClient) return publicClient;
    publicClient = createPublicClient({
        chain: sepolia,
        transport: http(process.env.RPC_PROVIDER_URL || 'https://sepolia.rpc.storyprotocol.net'),
    });
    return publicClient;
}


// --- Service Functions ---

export interface MintAndRegisterIPAssetResponse {
    ipId: Address;
    tokenId: string;
    txHash: Address;
}

export interface RegisterDerivativeIpRequest {
    parentIpId: Address;
    parentLicenseTermsId: string;
    creatorWallet: Address;
    metadata: {
        ipfs_uri: string;
        content_hash: string;
    };
}

export interface RegisterDerivativeIpResponse {
    childIpId: Address;
    childTokenId: string;
    txHash: Address;
}

/**
 * Registers a derivative as an IP Asset on Story Protocol and mints an NFT for it.
 */
export async function registerAndMintIpAsset(derivative: IDerivative): Promise<MintAndRegisterIPAssetResponse> {
  const storyClient = getStoryClient();
  logger.info(`Registering IP Asset for derivative: ${derivative.derivative_id}`);

  // Ensure content_hash has 0x prefix and is exactly 32 bytes (64 hex chars)
  let contentHash = derivative.processing.content_hash || '';
  if (!contentHash.startsWith('0x')) {
    contentHash = `0x${contentHash}`;
  }
  
  // Validate it's 32 bytes (66 chars with 0x prefix)
  if (contentHash.length !== 66) {
    throw new Error(`Invalid content hash length: ${contentHash.length}. Expected 66 characters (0x + 64 hex digits)`);
  }

  logger.debug(`[STORY:REGISTER] Prepared metadata`, {
    derivative_id: derivative.derivative_id,
    ipfs_hash: derivative.processing.ipfs_hash,
    content_hash: contentHash,
    ipfs_uri: `ipfs://${derivative.processing.ipfs_hash}`
  });

  try {
    // Use registerIpAsset to mint NFT and register IP in one transaction
    const response = await storyClient.ipAsset.registerIpAsset({
      nft: {
        type: "mint",
        spgNftContract: STORY_CONFIG.SPG_NFT_CONTRACT as Address,
      },
      ipMetadata: {
        ipMetadataURI: `https://ipfs.io/ipfs/${derivative.processing.ipfs_hash}`,
        ipMetadataHash: contentHash as `0x${string}`,
        nftMetadataURI: `https://ipfs.io/ipfs/${derivative.processing.ipfs_hash}`,
        nftMetadataHash: contentHash as `0x${string}`,
      },
    });
    
    if (!response.ipId || !response.tokenId) {
        throw new Error('Failed to get ipId or tokenId from registration response.');
    }
    if (!response.txHash) {
        throw new Error('No transaction hash returned from registration response.');
    }
    
    logger.info('Successfully registered IP Asset.', { txHash: response.txHash, ipId: response.ipId, tokenId: response.tokenId.toString() });

    return {
      ipId: response.ipId,
      tokenId: response.tokenId.toString(),
      txHash: response.txHash,
    };
  } catch (error) {
    logger.error('Failed to register IP Asset with Story Protocol:', error);
    throw new Error('Could not register IP Asset.');
  }
}

interface AttachLicenseTermsRequest {
    ipId: Address;
    commercialRevShare: number;
}

interface AttachLicenseTermsResponse {
    licenseTermsId: string;
    txHash: Address;
}

export async function attachLicenseTerms(request: AttachLicenseTermsRequest): Promise<AttachLicenseTermsResponse> {
    const storyClient = getStoryClient();
    const { ipId, commercialRevShare } = request;

    logger.info(`Registering and attaching license terms for IP ID: ${ipId}`);

    // Step 1: Register the Commercial Remix PIL with the specified revenue share
    const registerResponse = await storyClient.license.registerCommercialRemixPIL({
        defaultMintingFee: 0,
        commercialRevShare,
        currency: STORY_CONFIG.WIP_TOKEN_ADDRESS as Address,
        royaltyPolicyAddress: STORY_CONFIG.LAP_ROYALTY_POLICY_ADDRESS as Address,
    });

    if (!registerResponse.licenseTermsId) {
        throw new Error('Failed to get licenseTermsId from registration response.');
    }
    const licenseTermsId = registerResponse.licenseTermsId;
    logger.info(`Successfully registered new license terms: ${licenseTermsId}`);

    // Step 2: Attach the newly registered license terms to the IP asset
    const attachResponse = await storyClient.license.attachLicenseTerms({
        ipId,
        licenseTermsId,
        licenseTemplate: STORY_CONFIG.COMMERCIAL_USE_PIL_TEMPLATE as Address,
    });

    logger.info(`Successfully attached license ${licenseTermsId} to IP ${ipId}. Tx: ${attachResponse.txHash || '0x'}`);

    return {
        licenseTermsId: licenseTermsId.toString(),
        txHash: (attachResponse.txHash || '0x') as Address,
    };
}


interface MintLicenseTokenRequest {
    ipId: Address;
    licenseTermsId: string;
    buyerWallet: Address;
    amount: number;
}

interface MintLicenseTokenResponse {
    licenseTokenId: string;
    txHash: Address;
}

export async function mintLicenseToken(request: MintLicenseTokenRequest): Promise<MintLicenseTokenResponse> {
    const storyClient = getStoryClient();
    const { ipId, licenseTermsId, buyerWallet, amount } = request;
    logger.info(`Minting ${amount} license token(s) for IP ${ipId} with terms ${licenseTermsId} to ${buyerWallet}`);

    const response = await storyClient.license.mintLicenseTokens({
        licensorIpId: ipId,
        licenseTermsId: BigInt(licenseTermsId),
        licenseTemplate: STORY_CONFIG.COMMERCIAL_USE_PIL_TEMPLATE as Address,
        amount,
        receiver: buyerWallet,
    });

    if (!response.licenseTokenIds || response.licenseTokenIds.length === 0) {
        throw new Error('Failed to get licenseTokenIds from minting response.');
    }

    logger.info(`Successfully minted license tokens ${response.licenseTokenIds}. Tx: ${response.txHash}`);

    return {
        licenseTokenId: response.licenseTokenIds[0].toString(),
        txHash: (response.txHash || '0x') as Address,
    };
}

/**
 * Verifies if a given wallet address holds a license for a specific IP asset.
 * Since the SDK doesn't provide isLicenseHolder, we check if an Asset record exists.
 */
export async function verifyLicenseOwnership(ipId: Address, potentialOwner: Address): Promise<boolean> {
  logger.info(`Verifying license ownership of IP ${ipId} for ${potentialOwner}`);

  try {
    // Import Asset model to check if user has an asset with this IP ID
    const Asset = (await import('../models/Asset')).default;

    const asset = await Asset.findOne({
      ip_id: ipId,
      owner_wallet: potentialOwner.toLowerCase(),
      access_type: 'license'
    });

    return !!asset;
  } catch (error) {
    logger.error(`Failed to verify license ownership for IP ${ipId}:`, error);
    return false;
  }
}

export async function registerDerivativeIp(request: RegisterDerivativeIpRequest): Promise<RegisterDerivativeIpResponse> {
  const storyClient = getStoryClient();
  const { parentIpId, parentLicenseTermsId, creatorWallet, metadata } = request;

  logger.info(`[STORY:REGISTER_DERIVATIVE] Registering child IP for parent ${parentIpId}`);

  const response = await storyClient.ipAsset.registerDerivativeIpAsset({
    nft: {
      type: "mint",
      spgNftContract: STORY_CONFIG.SPG_NFT_CONTRACT as Address,
    },
    derivData: {
      parentIpIds: [parentIpId],
      licenseTermsIds: [BigInt(parentLicenseTermsId)],
    },
    ipMetadata: {
      ipMetadataURI: metadata.ipfs_uri,
      ipMetadataHash: metadata.content_hash as `0x${string}`,
      nftMetadataURI: metadata.ipfs_uri,
      nftMetadataHash: metadata.content_hash as `0x${string}`,
    },
  });

  if (!response.ipId || !response.tokenId) {
    throw new Error('Failed to get ipId or tokenId from derivative registration response.');
  }

  logger.info(`[STORY:REGISTER_DERIVATIVE] Successfully registered child IP ${response.ipId}`);

  return {
    childIpId: response.ipId as Address,
    childTokenId: response.tokenId.toString(),
    txHash: (response.txHash || '0x') as Address,
  };
}