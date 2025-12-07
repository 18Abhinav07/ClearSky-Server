import { StoryClient, StoryConfig } from '@story-protocol/core-sdk';
import { http, Address, createWalletClient, WalletClient, Account, PublicClient, createPublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { STORY_CONFIG } from '../config/constants';
import { logger } from '../utils/logger';
import { IDerivative } from '../types/derivative.types';

// --- Minimal ABIs for direct contract interaction ---

const ERC721_MINIMAL_ABI = [
  {
    "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
    "name": "ownerOf",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "from", "type": "address" },
      { "internalType": "address", "name": "to", "type": "address" },
      { "internalType": "uint256", "name": "tokenId", "type": "uint256" }
    ],
    "name": "transferFrom",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;


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

/**
 * Transfers a newly minted NFT from the platform wallet to the buyer.
 */
export async function transferNftToBuyer(tokenId: string, buyerWallet: Address): Promise<Address> {
    if (!STORY_CONFIG.PLATFORM_WALLET_PRIVATE_KEY) {
        throw new Error('PLATFORM_WALLET_PRIVATE_KEY is not set. Cannot transfer NFT.');
    }

    const platformAccount = privateKeyToAccount(STORY_CONFIG.PLATFORM_WALLET_PRIVATE_KEY as `0x${string}`);
    const platformWalletClient = createWalletClient({
        account: platformAccount,
        chain: sepolia,
        transport: http(process.env.RPC_PROVIDER_URL || 'https://sepolia.rpc.storyprotocol.net'),
    });

    logger.info(`Transferring token ${tokenId} from ${platformAccount.address} to ${buyerWallet}`);

    const txHash = await platformWalletClient.writeContract({
        address: STORY_CONFIG.SPG_NFT_CONTRACT as Address,
        abi: ERC721_MINIMAL_ABI,
        functionName: 'transferFrom',
        args: [platformAccount.address, buyerWallet, BigInt(tokenId)],
    });

    logger.info(`Successfully initiated transfer. Transaction hash: ${txHash}`);
    return txHash;
}


/**
 * Verifies if a given wallet address is the owner of a specific token.
 */
export async function verifyOwnership(tokenId: string, potentialOwner: Address): Promise<boolean> {
  const reader = getPublicClient();
  logger.info(`Verifying ownership of token ${tokenId} for ${potentialOwner}`);

  try {
    const owner = await reader.readContract({
        address: STORY_CONFIG.SPG_NFT_CONTRACT as Address,
        abi: ERC721_MINIMAL_ABI,
        functionName: 'ownerOf',
        args: [BigInt(tokenId)]
    });

    return owner.toLowerCase() === potentialOwner.toLowerCase();
  } catch (error) {
    logger.error(`Failed to verify ownership for token ${tokenId}:`, error);
    return false;
  }
}