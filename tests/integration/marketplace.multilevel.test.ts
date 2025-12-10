import request from 'supertest';
import app from '../../src/app';
import User from '../../src/models/User';
import Asset from '../../src/models/Asset';
import UserDerivative from '../../src/models/UserDerivative';
import UserDerivativeSale from '../../src/models/UserDerivativeSale';
import * as StoryService from '../../src/services/story.service';
import * as IpfsService from '../../src/services/ipfs.service';
import { getRedisClient } from '../../src/database/redis.connection';

// Mock services
jest.mock('../../src/services/story.service');
jest.mock('../../src/services/ipfs.service');

const mockedStoryService = StoryService as jest.Mocked<typeof StoryService>;
const mockedIpfsService = IpfsService as jest.Mocked<typeof IpfsService>;

describe('Multi-Level Marketplace Integration', () => {
    let accessToken: string;
    let userWallet: string;
    let parentAssetId: string;

    beforeAll(async () => {
        await User.deleteMany({});
        await Asset.deleteMany({});
        await UserDerivative.deleteMany({});
        await UserDerivativeSale.deleteMany({});
        await getRedisClient().flushdb();
    });

    beforeEach(async () => {
        // 1. Create a user and log in
        userWallet = '0x1234567890abcdef1234567890abcdef12345678';
        const loginRes = await request(app)
            .post('/api/v1/auth/login')
            .send({ wallet_address: userWallet });
        accessToken = loginRes.body.data.tokens.access_token;

        // 2. Create a parent asset for the user
        const asset = new Asset({
            asset_id: 'parent_asset_1',
            owner_wallet: userWallet,
            derivative_id: 'platform_deriv_1',
            ip_id: '0xparentipid11111111111111111111111111111111',
            token_id: '101',
            license_token_id: '201',
            license_terms_id: '301',
            access_type: 'license',
            can_create_derivatives: true,
            purchase_price: 100,
            purchase_tx_hash: '0xabc'
        });
        await asset.save();
        parentAssetId = asset.asset_id;

        // Reset mocks before each test
        jest.clearAllMocks();
    });

    describe('POST /api/v1/marketplace/derivatives/create', () => {
        it('should create a new user derivative successfully', async () => {
            // Arrange
            mockedStoryService.verifyLicenseOwnership.mockResolvedValue(true);
            mockedIpfsService.pinJSONToIPFS.mockResolvedValue({
                ipfsHash: 'QmNewDerivative',
                ipfsUri: 'ipfs://QmNewDerivative',
                pinSize: 100,
            });
            mockedStoryService.registerDerivativeIp.mockResolvedValue({
                childIpId: '0xchildipid11111111111111111111111111111111',
                childTokenId: '401',
                txHash: '0xdef',
            });
            mockedStoryService.attachLicenseTerms.mockResolvedValue({
                licenseTermsId: '501',
                txHash: '0xghi',
            });

            const derivativeData = {
                parentAssetId,
                title: 'My AI Model',
                description: 'A model for predicting things.',
                derivativeType: 'MODEL',
                contentUri: 'ipfs://QmContent',
                price: 50,
                creatorRevShare: 15,
            };

            // Act
            const res = await request(app)
                .post('/api/v1/marketplace/derivatives/create')
                .set('Authorization', `Bearer ${accessToken}`)
                .send(derivativeData)
                .expect(201);

            // Assert
            expect(res.body.success).toBe(true);
            expect(res.body.data.child_ip_id).toBe('0xchildipid11111111111111111111111111111111');
            const dbDerivative = await UserDerivative.findOne({ user_derivative_id: res.body.data.user_derivative_id });
            expect(dbDerivative).not.toBeNull();
            expect(dbDerivative?.title).toBe('My AI Model');
        });

        it('should fail if user does not own the parent asset', async () => {
            // Arrange
            const anotherUserWallet = '0xanotherwalletaddress1234567890abcdef1234'
            const loginRes = await request(app)
            .post('/api/v1/auth/login')
            .send({ wallet_address: anotherUserWallet });
            const anotherUserToken = loginRes.body.data.tokens.access_token;
            
            const derivativeData = {
                parentAssetId, // Belongs to original user
                title: 'Another Model',
                description: 'Should fail',
                derivativeType: 'MODEL',
                contentUri: 'ipfs://QmContent',
                price: 50,
                creatorRevShare: 10,
            };

            // Act
            const res = await request(app)
                .post('/api/v1/marketplace/derivatives/create')
                .set('Authorization', `Bearer ${anotherUserToken}`)
                .send(derivativeData)
                .expect(403);

            // Assert
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain('You must own a license');
        });
    });

    describe('GET /api/v1/marketplace/derivatives/my-creations/:walletAddress', () => {
        it('should return a list of derivatives created by the user', async () => {
            // Arrange
            const newDerivative = new UserDerivative({
                creator_wallet: userWallet,
                title: 'Test Derivative',
                parent_asset_id: parentAssetId,
                parent_ip_id: '0xparentipid11111111111111111111111111111111',
                child_ip_id: '0xchildipid22222222222222222222222222222222',
                child_token_id: '402',
                description: 'test',
                derivative_type: 'DATASET',
                content_uri: 'ipfs://somecontent',
                ipfs_hash: 'somehash',
                price: 10,
                license_terms_id: '502',
            });
            await newDerivative.save();

            // Act
            const res = await request(app)
                .get(`/api/v1/marketplace/derivatives/my-creations/${userWallet}`)
                .expect(200);

            // Assert
            expect(res.body.success).toBe(true);
            expect(res.body.data.length).toBe(1);
            expect(res.body.data[0].title).toBe('Test Derivative');
        });
    });
    
    describe('GET /api/v1/marketplace/derivatives/community', () => {
        it('should return all listed community derivatives', async () => {
             // Arrange
             const newDerivative = new UserDerivative({
                creator_wallet: userWallet,
                title: 'Community Derivative',
                parent_asset_id: parentAssetId,
                parent_ip_id: '0xparentipid11111111111111111111111111111111',
                child_ip_id: '0xchildipid33333333333333333333333333333333',
                child_token_id: '403',
                description: 'test',
                derivative_type: 'ANALYSIS',
                content_uri: 'ipfs://somecontent',
                ipfs_hash: 'somehash',
                price: 25,
                license_terms_id: '503',
                is_listed: true,
            });
            await newDerivative.save();

            // Act
            const res = await request(app)
                .get('/api/v1/marketplace/derivatives/community')
                .expect(200);

            // Assert
            expect(res.body.success).toBe(true);
            expect(res.body.data.length).toBeGreaterThanOrEqual(1);
            expect(res.body.data.some((d: any) => d.title === 'Community Derivative')).toBe(true);
        });
    });

    describe('POST /api/v1/marketplace/derivatives/purchase/:userDerivativeId', () => {
        it('should successfully purchase a user-created derivative', async () => {
            // Arrange
            const derivativeToSell = new UserDerivative({
                creator_wallet: '0xsomeothercreator',
                title: 'Derivative for Sale',
                parent_asset_id: 'some_parent_asset',
                parent_ip_id: '0xparentip',
                child_ip_id: '0xchildipforsale',
                child_token_id: '601',
                description: 'test sale',
                derivative_type: 'MODEL',
                content_uri: 'ipfs://somecontent',
                ipfs_hash: 'somehash',
                price: 150,
                license_terms_id: '701',
                is_listed: true,
            });
            await derivativeToSell.save();

            mockedStoryService.mintLicenseToken.mockResolvedValue({
                licenseTokenId: '801',
                txHash: '0xjkl',
            });

            // Act
            const res = await request(app)
                .post(`/api/v1/marketplace/derivatives/purchase/${derivativeToSell.user_derivative_id}`)
                .send({ buyerWallet: userWallet })
                .expect(200);

            // Assert
            expect(res.body.success).toBe(true);
            expect(res.body.message).toContain('licensed successfully');
            expect(res.body.data.license_token_id).toBe('801');
            
            const saleRecord = await UserDerivativeSale.findOne({ user_derivative_id: derivativeToSell.user_derivative_id });
            expect(saleRecord).not.toBeNull();
            expect(saleRecord?.price).toBe(150);

            const buyerAsset = await Asset.findOne({ asset_id: res.body.data.asset_id });
            expect(buyerAsset).not.toBeNull();
            expect(buyerAsset?.owner_wallet).toBe(userWallet);
        });
    });
});
