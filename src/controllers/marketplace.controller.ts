import { Request, Response } from 'express';
import * as DerivativeRepository from '../database/derivative.repository';
import * as StoryService from '../services/story.service';
import { Derivative } from '../models/Derivative';
import Asset from '../models/Asset';
import User from '../models/User';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import AQIReading from '../models/AQIReading';
import { IAQIReading } from '../types/aqi-reading.types';

// Platform configuration
const PLATFORM_FEE_PERCENTAGE = 10; // 10% platform fee
const ORIGINAL_OWNER_ROYALTY_PERCENTAGE = 5; // 5% royalty to original data owner

/**
 * Lists all available (MONTHLY) derivatives for sale with filtering and search capabilities.
 */
export const listDerivatives = async (req: Request, res: Response) => {
    try {
        logger.info(`[MARKETPLACE:LIST] Function called`, {
            path: req.path,
            params: JSON.stringify(req.params),
            query: JSON.stringify(req.query)
        });
        logger.debug(`[MARKETPLACE] Listing derivatives request received`, {
            query: JSON.stringify(req.query)
        });

        const {
            is_minted,
            type,
            limit = '50',
            offset = '0',
            search
        } = req.query;

        // Build filter query
        const filter: any = {};

        if (is_minted !== undefined) {
            filter.is_minted = is_minted === 'true';
        }

        if (type) {
            filter.type = type;
        }

        logger.debug(`[MARKETPLACE] Filter constructed`, {
            filter: JSON.stringify(filter)
        });

        const derivatives = await Derivative.find(filter)
            .limit(parseInt(limit as string))
            .skip(parseInt(offset as string))
            .sort({ created_at: -1 })
            .lean();

        logger.debug(`[MARKETPLACE] Found ${derivatives.length} derivatives`, {
            count: derivatives.length,
            filter: JSON.stringify(filter)
        });

        // Enrich derivatives with metadata
        const enrichedDerivatives = await Promise.all(
            derivatives.map(async (deriv) => {
                logger.debug(`[MARKETPLACE] Enriching derivative ${deriv.derivative_id}`, {
                    derivative_id: deriv.derivative_id,
                    parent_data_ids: JSON.stringify(deriv.parent_data_ids)
                });

                // Fetch primitive data for this derivative
                const primitiveData = await AQIReading.find({
                    reading_id: { $in: deriv.parent_data_ids }
                }).lean();

                logger.debug(`[MARKETPLACE] Found ${primitiveData.length} primitive readings for derivative ${deriv.derivative_id}`, {
                    derivative_id: deriv.derivative_id,
                    primitive_count: primitiveData.length,
                    primitive_ids: JSON.stringify(primitiveData.map((p: IAQIReading) => p.reading_id))
                });

                return {
                    ...deriv,
                    primitive_data: primitiveData,
                    owner: deriv.is_minted ? 'Sold' : 'Available',
                };
            })
        );

        logger.debug(`[MARKETPLACE] Successfully enriched all derivatives`, {
            total_count: enrichedDerivatives.length
        });

        res.status(200).json({
            success: true,
            data: enrichedDerivatives,
            pagination: {
                limit: parseInt(limit as string),
                offset: parseInt(offset as string),
                total: enrichedDerivatives.length,
            },
        });
    } catch (error) {
        logger.error('[MARKETPLACE] Failed to list derivatives:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * Get detailed information about a specific derivative
 */
export const getDerivativeDetails = async (req: Request, res: Response) => {
    try {
        const { derivativeId } = req.params;

        logger.info(`[MARKETPLACE:DETAILS] Function called`, {
            path: req.path,
            params: JSON.stringify(req.params),
            query: JSON.stringify(req.query),
            derivativeId
        });
        logger.debug(`[MARKETPLACE] Get derivative details request`, {
            derivative_id: derivativeId
        });

        const derivative = await Derivative.findOne({ derivative_id: derivativeId }).lean();

        if (!derivative) {
            logger.debug(`[MARKETPLACE] Derivative not found`, {
                derivative_id: derivativeId
            });
            return res.status(404).json({ success: false, message: 'Derivative not found.' });
        }

        // Fetch primitive data
        const primitiveData = await AQIReading.find({
            reading_id: { $in: derivative.parent_data_ids }
        }).lean();

        logger.debug(`[MARKETPLACE] Derivative details retrieved`, {
            derivative_id: derivativeId,
            derivative: JSON.stringify(derivative),
            primitive_data_count: primitiveData.length,
            primitive_data: JSON.stringify(primitiveData)
        });

        res.status(200).json({
            success: true,
            data: {
                ...derivative,
                primitive_data: primitiveData,
            },
        });
    } catch (error) {
        logger.error(`[MARKETPLACE] Failed to get derivative details:`, error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * Handles the purchase of a derivative, which triggers the on-demand minting,
 * NFT transfer, royalty distribution, and asset tracking.
 */
export const purchaseDerivative = async (req: Request, res: Response) => {
    try {
        const { derivativeId } = req.params;
        const { buyerWallet } = req.body;
        const commercialRevShare = 10; // Platform gets 10% of buyer's derivatives

        logger.debug(`[MARKETPLACE:PURCHASE] Purchase initiated`, {
            derivative_id: derivativeId,
            buyer_wallet: buyerWallet,
            request_body: JSON.stringify(req.body)
        });

        if (!buyerWallet) {
            logger.debug(`[MARKETPLACE:PURCHASE] Missing buyer wallet`, {
                derivative_id: derivativeId
            });
            return res.status(400).json({ success: false, message: 'Buyer wallet address is required.' });
        }

        if (!/^0x[a-fA-F0-9]{40}$/.test(buyerWallet)) {
            logger.debug(`[MARKETPLACE:PURCHASE] Invalid wallet format`, {
                derivative_id: derivativeId,
                buyer_wallet: buyerWallet
            });
            return res.status(400).json({ success: false, message: 'Invalid wallet address format.' });
        }

        const derivative = await Derivative.findOne({ derivative_id: derivativeId });

        if (!derivative) {
            logger.debug(`[MARKETPLACE:PURCHASE] Derivative not found`, {
                derivative_id: derivativeId
            });
            return res.status(404).json({ success: false, message: 'Derivative not found.' });
        }

        if (derivative.is_minted) {
            logger.debug(`[MARKETPLACE:PURCHASE] Derivative already processed`, {
                derivative_id: derivativeId,
            });
            return res.status(400).json({ success: false, message: 'This derivative has already been sold.' });
        }

        const primitiveReadings = await AQIReading.find({
            reading_id: { $in: derivative.parent_data_ids }
        }).lean();

        const originalOwnerWallet = primitiveReadings[0]?.owner_id || null;

        const basePrice = 100;
        const platformFee = (basePrice * PLATFORM_FEE_PERCENTAGE) / 100;
        const royalty = (basePrice * ORIGINAL_OWNER_ROYALTY_PERCENTAGE) / 100;

        logger.info(`[MARKETPLACE:PURCHASE] Starting IP Asset registration`, {
            derivative_id: derivativeId
        });

        // STEP 1: Register IP Asset (Platform owns)
        const { ipId, tokenId, txHash } = await StoryService.registerAndMintIpAsset(derivative);
        logger.debug(`[MARKETPLACE:PURCHASE] IP Asset registered`, { derivative_id: derivativeId, ip_id: ipId, token_id: tokenId });

        // STEP 2: Attach License Terms with revenue share
        const { licenseTermsId, txHash: licenseTermsTxHash } = await StoryService.attachLicenseTerms({
            ipId,
            commercialRevShare,
        });
        logger.debug(`[MARKETPLACE:PURCHASE] License terms attached`, { derivative_id: derivativeId, ip_id: ipId, license_terms_id: licenseTermsId });

        // STEP 3: Mint License Token for buyer
        const { licenseTokenId, txHash: licenseTxHash } = await StoryService.mintLicenseToken({
            ipId,
            licenseTermsId,
            buyerWallet: buyerWallet as `0x${string}`,
            amount: 1,
        });
        logger.debug(`[MARKETPLACE:PURCHASE] License token minted for buyer`, { derivative_id: derivativeId, license_token_id: licenseTokenId });

        // STEP 4: Update derivative record
        derivative.ip_id = ipId;
        derivative.token_id = tokenId;
        derivative.license_terms_id = licenseTermsId;
        derivative.is_minted = true;
        await derivative.save();
        logger.debug(`[MARKETPLACE:PURCHASE] Derivative record updated`, { derivative_id: derivativeId });

        // STEP 5: Create asset record
        const assetId = `asset_${uuidv4()}`;
        const asset = new Asset({
            asset_id: assetId,
            owner_wallet: buyerWallet.toLowerCase(),
            derivative_id: derivativeId,
            primitive_data_ids: derivative.parent_data_ids,
            ip_id: ipId,
            token_id: tokenId,
            license_token_id: licenseTokenId,
            license_terms_id: licenseTermsId,
            access_type: 'license',
            commercial_rev_share: commercialRevShare,
            purchase_price: basePrice,
            purchase_tx_hash: licenseTxHash,
            royalty_paid_to_original_owner: royalty,
            platform_fee: platformFee,
            purchased_at: new Date(),
            metadata: {
                derivative_type: derivative.type,
                content_hash: derivative.processing.content_hash || '',
                ipfs_uri: derivative.processing.ipfs_uri || '',
            },
        });
        await asset.save();
        logger.debug(`[MARKETPLACE:PURCHASE] Asset record created`, { asset_id: assetId });

        // Step 6: Update buyer's user record
        let buyer = await User.findOne({ walletAddress: buyerWallet.toLowerCase() });
        if (!buyer) {
            buyer = new User({ walletAddress: buyerWallet.toLowerCase(), devices: [], assets: [assetId] });
        } else {
            buyer.assets.push(assetId);
        }
        await buyer.save();
        logger.debug(`[MARKETPLACE:PURCHASE] Buyer user record updated`, { buyer_wallet: buyerWallet });

        logger.info(`[MARKETPLACE:PURCHASE] Purchase completed successfully`, {
            derivative_id: derivativeId,
            asset_id: assetId,
            ip_id: ipId,
            license_token_id: licenseTokenId
        });

        res.status(200).json({
            success: true,
            message: 'License minted! You now have rights to use this data.',
            data: {
                asset_id: assetId,
                ip_id: ipId,
                license_token_id: licenseTokenId,
                license_terms_id: licenseTermsId,
                access_type: 'license',
                platform_royalty: `${commercialRevShare}%`,
                pricing: {
                    total_paid: basePrice,
                    platform_immediate_fee: platformFee,
                    original_owner_royalty: royalty,
                },
                royalty_info: {
                    platform_earns_from_derivatives: `${commercialRevShare}%`,
                    how_it_works: `If you create derivatives, the platform receives ${commercialRevShare}% of revenue automatically.`,
                },
                tx_hashes: {
                    ip_mint: txHash,
                    license_attach: licenseTermsTxHash,
                    license_mint: licenseTxHash,
                }
            },
        });
    } catch (error) {
        logger.error(`[MARKETPLACE:PURCHASE] Purchase failed for derivative ${req.params.derivativeId}:`, {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            derivative_id: req.params.derivativeId,
            buyer_wallet: req.body.buyerWallet
        });
        res.status(500).json({ success: false, message: 'Server error during purchase.' });
    }
};

/**
 * Bulk purchase multiple derivatives by ID or filter
 */
export const bulkPurchaseDerivatives = async (req: Request, res: Response) => {
    try {
        const { buyerWallet, derivativeIds, filter } = req.body;
        const commercialRevShare = 10; // Platform gets 10%

        logger.debug(`[MARKETPLACE:BULK_PURCHASE] Bulk purchase initiated`, {
            buyer_wallet: buyerWallet,
            derivative_ids: JSON.stringify(derivativeIds),
            filter: JSON.stringify(filter)
        });

        if (!buyerWallet) {
            return res.status(400).json({ success: false, message: 'Buyer wallet address is required.' });
        }

        let derivatives;

        if (derivativeIds && derivativeIds.length > 0) {
            derivatives = await Derivative.find({
                derivative_id: { $in: derivativeIds },
                is_minted: false,
            });
        } else if (filter) {
            const queryFilter: any = { is_minted: false, ...filter };
            derivatives = await Derivative.find(queryFilter).limit(filter.limit || 10);
        } else {
            return res.status(400).json({
                success: false,
                message: 'Either derivativeIds array or a filter object is required.'
            });
        }

        if (derivatives.length === 0) {
            return res.status(404).json({ success: false, message: 'No available derivatives found for bulk purchase.' });
        }

        const results = [];

        for (const derivative of derivatives) {
            try {
                logger.debug(`[MARKETPLACE:BULK_PURCHASE] Processing derivative ${derivative.derivative_id}`);

                const { ipId, tokenId, txHash } = await StoryService.registerAndMintIpAsset(derivative);
                
                const { licenseTermsId } = await StoryService.attachLicenseTerms({
                    ipId,
                    commercialRevShare,
                });

                const { licenseTokenId } = await StoryService.mintLicenseToken({
                    ipId,
                    licenseTermsId,
                    buyerWallet: buyerWallet as `0x${string}`,
                    amount: 1,
                });

                derivative.ip_id = ipId;
                derivative.token_id = tokenId;
                derivative.license_terms_id = licenseTermsId;
                derivative.is_minted = true;
                await derivative.save();

                const assetId = `asset_${uuidv4()}`;
                const basePrice = 100;
                const platformFee = (basePrice * PLATFORM_FEE_PERCENTAGE) / 100;
                const royalty = (basePrice * ORIGINAL_OWNER_ROYALTY_PERCENTAGE) / 100;

                const asset = new Asset({
                    asset_id: assetId,
                    owner_wallet: buyerWallet.toLowerCase(),
                    derivative_id: derivative.derivative_id,
                    primitive_data_ids: derivative.parent_data_ids,
                    ip_id: ipId,
                    token_id: tokenId,
                    license_token_id: licenseTokenId,
                    license_terms_id: licenseTermsId,
                    access_type: 'license',
                    commercial_rev_share: commercialRevShare,
                    purchase_price: basePrice,
                    purchase_tx_hash: txHash, // Using the mint tx hash for now
                    royalty_paid_to_original_owner: royalty,
                    platform_fee: platformFee,
                });

                await asset.save();

                results.push({
                    success: true,
                    derivative_id: derivative.derivative_id,
                    asset_id: assetId,
                    ip_id: ipId,
                    license_token_id: licenseTokenId,
                });
            } catch (error) {
                logger.error(`[MARKETPLACE:BULK_PURCHASE] Failed to process derivative ${derivative.derivative_id}`, {
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                results.push({
                    success: false,
                    derivative_id: derivative.derivative_id,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }

        const successfulAssetIds = results.filter(r => r.success).map(r => r.asset_id);
        if (successfulAssetIds.length > 0) {
            await User.updateOne(
                { walletAddress: buyerWallet.toLowerCase() },
                { $push: { assets: { $each: successfulAssetIds } } },
                { upsert: true }
            );
        }

        logger.info(`[MARKETPLACE:BULK_PURCHASE] Bulk purchase completed`, {
            buyer_wallet: buyerWallet,
            successful_count: results.filter(r => r.success).length,
            failed_count: results.filter(r => !r.success).length,
        });

        res.status(200).json({
            success: true,
            message: 'Bulk purchase processing complete.',
            data: {
                total_processed: derivatives.length,
                successful: results.filter(r => r.success).length,
                failed: results.filter(r => !r.success).length,
                results,
            },
        });
    } catch (error) {
        logger.error('[MARKETPLACE:BULK_PURCHASE] Bulk purchase failed:', error);
        res.status(500).json({ success: false, message: 'Server error during bulk purchase.' });
    }
};

/**
 * Get all assets owned by a user
 */
export const getUserAssets = async (req: Request, res: Response) => {
    try {
        const { walletAddress } = req.params;

        logger.debug(`[MARKETPLACE] Get user assets request`, {
            wallet_address: walletAddress
        });

        const assets = await Asset.find({ owner_wallet: walletAddress.toLowerCase() }).lean();

        logger.debug(`[MARKETPLACE] Found ${assets.length} assets for user`, {
            wallet_address: walletAddress,
            asset_count: assets.length,
            assets: JSON.stringify(assets)
        });

        res.status(200).json({
            success: true,
            data: assets,
        });
    } catch (error) {
        logger.error('[MARKETPLACE] Failed to get user assets:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * Allows the owner of a derivative NFT to download the associated data.
 */
export const downloadDerivative = async (req: Request, res: Response) => {
    try {
        const { derivativeId } = req.params;
        const walletAddress = req.user?.walletAddress;

        logger.debug(`[MARKETPLACE:DOWNLOAD] Download request received`, {
            derivative_id: derivativeId,
            wallet_address: walletAddress
        });

        if (!walletAddress) {
            logger.debug(`[MARKETPLACE:DOWNLOAD] Missing wallet address`, {
                derivative_id: derivativeId
            });
            return res.status(401).json({ success: false, message: 'Unauthorized. Wallet address is missing.' });
        }

        const derivative = await Derivative.findOne({ derivative_id: derivativeId });

        if (!derivative || !derivative.is_minted || !derivative.ip_id) {
            logger.debug(`[MARKETPLACE:DOWNLOAD] Derivative not found, not minted, or has no IP ID`, {
                derivative_id: derivativeId,
                found: !!derivative,
                is_minted: derivative?.is_minted,
                ip_id: derivative?.ip_id
            });
            return res.status(404).json({ success: false, message: 'Sold derivative not found.' });
        }

        logger.debug(`[MARKETPLACE:DOWNLOAD] Verifying license ownership`, {
            derivative_id: derivativeId,
            ip_id: derivative.ip_id,
            wallet_address: walletAddress
        });

        const hasLicense = await StoryService.verifyLicenseOwnership(derivative.ip_id as `0x${string}`, walletAddress as `0x${string}`);

        logger.debug(`[MARKETPLACE:DOWNLOAD] License verification result`, {
            derivative_id: derivativeId,
            ip_id: derivative.ip_id,
            wallet_address: walletAddress,
            has_license: hasLicense
        });

        if (!hasLicense) {
            return res.status(403).json({ success: false, message: 'You do not have a valid license to download this derivative.' });
        }

        logger.info(`[MARKETPLACE:DOWNLOAD] Download access granted`, {
            derivative_id: derivativeId,
            wallet_address: walletAddress
        });

        res.status(200).json({
            success: true,
            message: 'License verified. Download access granted.',
            data: {
                content: derivative.content,
                processing: derivative.processing,
            },
        });
    } catch (error) {
        logger.error(`[MARKETPLACE:DOWNLOAD] Download failed for derivative ${req.params.derivativeId}:`, error);
        res.status(500).json({ success: false, message: 'Server error during download.' });
    }
};
