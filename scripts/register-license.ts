import { StoryClient, StoryConfig } from '@story-protocol/core-sdk';
import { http, Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { STORY_CONFIG } from '../src/config/constants';
import { logger } from '../src/utils/logger';

// --- AENEID TESTNET ADDRESSES ---
// WIP Token: Whitelisted revenue token for the Aeneid testnet
const WIP_TOKEN_ADDRESS: Address = '0x1514000000000000000000000000000000000000';
// LAP Royalty Policy: Liquid Absolute Percentage royalty policy contract
const LAP_ROYALTY_POLICY_ADDRESS: Address = '0xBe54FB168b3c982b7AaE60dB6CF75Bd8447b390E';

async function registerLicense() {
  if (!STORY_CONFIG.PRIVATE_KEY) {
    logger.error('STORY_PRIVATE_KEY is not set in your .env file. Cannot register license.');
    return;
  }

  logger.info('Initializing Story Protocol client to register license...');

  const config: StoryConfig = {
    transport: http(process.env.RPC_PROVIDER_URL || 'https://aeneid.storyrpc.io'),
    account: privateKeyToAccount(STORY_CONFIG.PRIVATE_KEY as `0x${string}`),
  };

  const client = StoryClient.newClient(config);

  logger.info('Registering Commercial Use PIL...');

  try {
    const response = await client.license.registerCommercialUsePIL({
      defaultMintingFee: 0n, // '0n' represents a BigInt of 0
      currency: WIP_TOKEN_ADDRESS,
      royaltyPolicyAddress: LAP_ROYALTY_POLICY_ADDRESS,
    });

    // Debug: Log the full response
    console.log('DEBUG - Full response:', JSON.stringify(response, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));

    logger.info('✅ Successfully registered license terms!');
    logger.info('\n═══════════════════════════════════════════════════════════');
    logger.info('📝 License Registration Details:');
    logger.info('═══════════════════════════════════════════════════════════');

    if (response.licenseTermsId) {
      logger.info(`  License Terms ID: ${response.licenseTermsId}`);
    }

    if (response.txHash) {
      logger.info(`  Tx Hash: ${response.txHash}`);
      logger.info(`  Explorer: https://explorer.story.foundation/tx/${response.txHash}`);
    }

    logger.info('═══════════════════════════════════════════════════════════\n');

    if (response.licenseTermsId) {
      logger.info('🔧 Next Step:');
      logger.info(`   Add this to your .env file:`);
      logger.info(`   LICENSE_TERMS_ID=${response.licenseTermsId}\n`);
    }

  } catch (error) {
    logger.error('Failed to register license terms:', error);
  }
}

registerLicense();
