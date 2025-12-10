import { StoryClient } from '@story-protocol/core-sdk';
import { mock, MockProxy } from 'jest-mock-extended';
import * as StoryService from '../../src/services/story.service';
import { STORY_CONFIG } from '../../src/config/constants';
import { Address } from 'viem';

// Mock the core SDK client
jest.mock('@story-protocol/core-sdk', () => {
  return {
    StoryClient: {
      newClient: jest.fn(),
    },
  };
});

describe('Story Service', () => {
  let mockStoryClient: MockProxy<StoryClient>;

  beforeEach(() => {
    // Provide a mock implementation for the client
    mockStoryClient = mock<StoryClient>();
    (StoryClient.newClient as jest.Mock).mockReturnValue(mockStoryClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('registerDerivativeIp', () => {
    it('should register a derivative IP and return the new IP details', async () => {
      // Arrange
      const request: StoryService.RegisterDerivativeIpRequest = {
        parentIpId: '0x1234567890123456789012345678901234567890',
        parentLicenseTermsId: '1',
        creatorWallet: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        metadata: {
          ipfs_uri: 'ipfs://QmSomeHash',
          content_hash: '0x7465737468617368000000000000000000000000000000000000000000000000',
        },
      };

      const mockResponse = {
        txHash: '0x9876543210987654321098765432109876543210',
        ipId: '0x0987654321098765432109876543210987654321',
        tokenId: 2n,
      };

      // Mock the specific SDK method
      mockStoryClient.ipAsset.registerDerivativeIp.mockResolvedValue(mockResponse);

      // Act
      const result = await StoryService.registerDerivativeIp(request);

      // Assert
      expect(StoryClient.newClient).toHaveBeenCalled();
      expect(mockStoryClient.ipAsset.registerDerivativeIp).toHaveBeenCalledWith({
        nft: {
          type: 'mint',
          spgNftContract: STORY_CONFIG.SPG_NFT_CONTRACT as Address,
          mintTo: request.creatorWallet,
        },
        derivData: {
          parentIpIds: [request.parentIpId],
          licenseTermsIds: [BigInt(request.parentLicenseTermsId)],
        },
        ipMetadata: {
          ipMetadataURI: request.metadata.ipfs_uri,
          ipMetadataHash: request.metadata.content_hash as `0x${string}`,
          nftMetadataURI: request.metadata.ipfs_uri,
          nftMetadataHash: request.metadata.content_hash as `0x${string}`,
        },
      });

      expect(result).toEqual({
        childIpId: mockResponse.ipId,
        childTokenId: mockResponse.tokenId.toString(),
        txHash: mockResponse.txHash,
      });
    });

    it('should throw an error if registration fails', async () => {
        // Arrange
        const request: StoryService.RegisterDerivativeIpRequest = {
            parentIpId: '0x1234567890123456789012345678901234567890',
            parentLicenseTermsId: '1',
            creatorWallet: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
            metadata: {
                ipfs_uri: 'ipfs://QmSomeHash',
                content_hash: '0x7465737468617368000000000000000000000000000000000000000000000000',
            },
        };

        const errorMessage = 'SDK Error';
        mockStoryClient.ipAsset.registerDerivativeIp.mockRejectedValue(new Error(errorMessage));

        // Act & Assert
        await expect(StoryService.registerDerivativeIp(request)).rejects.toThrow(errorMessage);
    });
  });
});
