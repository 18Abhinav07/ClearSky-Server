import { StoryClient, StoryConfig } from '@story-protocol/core-sdk';
import { http } from 'viem';
import { privateKeyToAccount, Address } from 'viem/accounts';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Creates a new SPG NFT Collection for ClearSky Data Marketplace
 * This should be run ONCE during setup
 */
async function createNFTCollection() {
  console.log('🚀 Creating SPG NFT Collection for ClearSky...\n');

  // Validate environment variables
  if (!process.env.STORY_PRIVATE_KEY) {
    throw new Error('STORY_PRIVATE_KEY is not set in .env file');
  }

  if (!process.env.RPC_PROVIDER_URL) {
    throw new Error('RPC_PROVIDER_URL is not set in .env file');
  }

  try {
    // Initialize Story Protocol client
    const config: StoryConfig = {
      transport: http(process.env.RPC_PROVIDER_URL),
      account: privateKeyToAccount(process.env.STORY_PRIVATE_KEY as Address),
    };

    const client = StoryClient.newClient(config);
    console.log('✓ Story Protocol client initialized');
    console.log(`  RPC: ${process.env.RPC_PROVIDER_URL}\n`);

    // Create NFT collection
    console.log('⏳ Creating NFT collection (this may take 30-60 seconds)...');

    const newCollection = await client.nftClient.createNFTCollection({
      name: 'ClearSky AQI Data Derivatives',
      symbol: 'CSAQI',
      isPublicMinting: false,  // Only platform can mint
      mintOpen: true,          // Minting is enabled
      mintFeeRecipient: process.env.PLATFORM_WALLET_PRIVATE_KEY
        ? privateKeyToAccount(process.env.PLATFORM_WALLET_PRIVATE_KEY as Address).address
        : privateKeyToAccount(process.env.STORY_PRIVATE_KEY as Address).address,
      contractURI: '',         // Optional: Can add collection metadata later
    });

    console.log('\n✅ SUCCESS! NFT Collection Created!\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📝 Collection Details:');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Name:     ClearSky AQI Data Derivatives`);
    console.log(`  Symbol:   CSAQI`);
    console.log(`  Contract: ${newCollection.spgNftContract}`);
    console.log(`  Tx Hash:  ${newCollection.txHash}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('🔧 Next Steps:\n');
    console.log('1. Add this to your .env file:');
    console.log(`   STORY_SPG_NFT_CONTRACT=${newCollection.spgNftContract}\n`);
    console.log('2. Verify the contract on the Story Protocol explorer:');
    console.log(`   https://explorer.story.foundation/tx/${newCollection.txHash}\n`);
    console.log('3. Run the license registration script:');
    console.log('   npm run story:register-license\n');

    return newCollection;

  } catch (error) {
    console.error('\n❌ ERROR creating NFT collection:');
    if (error instanceof Error) {
      console.error(`   ${error.message}`);

      if (error.message.includes('insufficient funds')) {
        console.error('\n💡 TIP: Your wallet needs testnet tokens!');
        console.error('   Get tokens from the Story Protocol faucet');
      }

      if (error.message.includes('network')) {
        console.error('\n💡 TIP: Check your RPC_PROVIDER_URL');
        console.error('   Should be: https://testnet.storyrpc.io');
      }
    } else {
      console.error(error);
    }

    process.exit(1);
  }
}

// Run the function
createNFTCollection()
  .then(() => {
    console.log('✓ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
