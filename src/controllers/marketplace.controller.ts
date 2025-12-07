import { Request, Response } from 'express';
import * as DerivativeRepository from '../database/derivative.repository';
import * as StoryService from '../services/story.service';
import { Derivative } from '../models/Derivative';
import Asset from '../models/Asset';
import User from '../models/User';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { AQIReading } from '../models/AQIReading';

// Platform configuration
const PLATFORM_FEE_PERCENTAGE = 10; // 10% platform fee
const ORIGINAL_OWNER_ROYALTY_PERCENTAGE = 5; // 5% royalty to original data owner

/**
 * Lists all available (MONTHLY) derivatives for sale with filtering and search capabilities.
 */
export const listDerivatives = async (req: Request, res: Response) => {
    try {
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
                    primitive_ids: JSON.stringify(primitiveData.map(p => p.reading_id))
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

        // Validate wallet format
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

        logger.debug(`[MARKETPLACE:PURCHASE] Derivative found`, {
            derivative_id: derivativeId,
            is_minted: derivative.is_minted,
            derivative_data: JSON.stringify(derivative)
        });

        if (derivative.is_minted) {
            logger.debug(`[MARKETPLACE:PURCHASE] Derivative already minted`, {
                derivative_id: derivativeId,
                token_id: derivative.token_id,
                ip_id: derivative.ip_id
            });
            return res.status(400).json({ success: false, message: 'This derivative has already been minted and sold.' });
        }

        // Fetch primitive data to get original owner
        const primitiveReadings = await AQIReading.find({
            reading_id: { $in: derivative.parent_data_ids }
        }).lean();

        logger.debug(`[MARKETPLACE:PURCHASE] Primitive readings fetched`, {
            derivative_id: derivativeId,
            primitive_count: primitiveReadings.length,
            primitive_readings: JSON.stringify(primitiveReadings)
        });

        const originalOwnerWallet = primitiveReadings[0]?.device_owner || null;

        logger.debug(`[MARKETPLACE:PURCHASE] Original owner identified`, {
            derivative_id: derivativeId,
            original_owner: originalOwnerWallet
        });

        // Calculate pricing (for demo purposes, using fixed price)
        const basePrice = 100; // $100 base price
        const platformFee = (basePrice * PLATFORM_FEE_PERCENTAGE) / 100;
        const royalty = (basePrice * ORIGINAL_OWNER_ROYALTY_PERCENTAGE) / 100;
        const sellerReceives = basePrice - platformFee - royalty;

        logger.debug(`[MARKETPLACE:PURCHASE] Pricing calculated`, {
            derivative_id: derivativeId,
            base_price: basePrice,
            platform_fee: platformFee,
            platform_fee_percentage: PLATFORM_FEE_PERCENTAGE,
            royalty: royalty,
            royalty_percentage: ORIGINAL_OWNER_ROYALTY_PERCENTAGE,
            original_owner_receives: royalty,
            seller_receives: sellerReceives
        });

        logger.info(`[MARKETPLACE:PURCHASE] Starting IP Asset registration and minting`, {
            derivative_id: derivativeId,
            buyer_wallet: buyerWallet
        });

        // Step 1: Register and mint IP Asset
        const { ipId, tokenId, txHash } = await StoryService.registerAndMintIpAsset(derivative);

        logger.debug(`[MARKETPLACE:PURCHASE] IP Asset registered and minted`, {
            derivative_id: derivativeId,
            ip_id: ipId,
            token_id: tokenId,
            tx_hash: txHash
        });

        // Step 2: Transfer NFT to buyer
        logger.info(`[MARKETPLACE:PURCHASE] Transferring NFT to buyer`, {
            derivative_id: derivativeId,
            token_id: tokenId,
            buyer_wallet: buyerWallet
        });

        const transferTxHash = await StoryService.transferNftToBuyer(tokenId, buyerWallet as `0x${string}`);

        logger.debug(`[MARKETPLACE:PURCHASE] NFT transferred to buyer`, {
            derivative_id: derivativeId,
            token_id: tokenId,
            buyer_wallet: buyerWallet,
            transfer_tx_hash: transferTxHash
        });

        // Step 3: Update derivative record
        derivative.ip_id = ipId;
        derivative.token_id = tokenId;
        derivative.is_minted = true;
        await derivative.save();

        logger.debug(`[MARKETPLACE:PURCHASE] Derivative record updated`, {
            derivative_id: derivativeId,
            updated_derivative: JSON.stringify(derivative)
        });

        // Step 4: Create asset record
        const assetId = `asset_${uuidv4()}`;

        const asset = new Asset({
            asset_id: assetId,
            owner_wallet: buyerWallet.toLowerCase(),
            derivative_id: derivativeId,
            primitive_data_ids: derivative.parent_data_ids,
            ip_id: ipId,
            token_id: tokenId,
            purchase_price: basePrice,
            purchase_tx_hash: transferTxHash,
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

        logger.debug(`[MARKETPLACE:PURCHASE] Asset record created`, {
            derivative_id: derivativeId,
            asset_id: assetId,
            asset_data: JSON.stringify(asset)
        });

        // Step 5: Update buyer's user record
        let buyer = await User.findOne({ walletAddress: buyerWallet.toLowerCase() });

        if (!buyer) {
            logger.debug(`[MARKETPLACE:PURCHASE] Creating new user record for buyer`, {
                buyer_wallet: buyerWallet
            });

            buyer = new User({
                walletAddress: buyerWallet.toLowerCase(),
                devices: [],
                assets: [assetId],
            });
        } else {
            logger.debug(`[MARKETPLACE:PURCHASE] Updating existing user record`, {
                buyer_wallet: buyerWallet,
                current_assets: JSON.stringify(buyer.assets)
            });

            buyer.assets.push(assetId);
        }

        await buyer.save();

        logger.debug(`[MARKETPLACE:PURCHASE] Buyer user record updated`, {
            buyer_wallet: buyerWallet,
            updated_user: JSON.stringify(buyer)
        });

        // Step 6: Update original owner's user record (if exists)
        if (originalOwnerWallet) {
            logger.debug(`[MARKETPLACE:PURCHASE] Updating original owner record`, {
                original_owner: originalOwnerWallet,
                royalty_amount: royalty
            });

            const originalOwner = await User.findOne({ walletAddress: originalOwnerWallet.toLowerCase() });

            logger.debug(`[MARKETPLACE:PURCHASE] Original owner lookup result`, {
                original_owner: originalOwnerWallet,
                found: !!originalOwner,
                owner_data: originalOwner ? JSON.stringify(originalOwner) : 'null'
            });
        }

        logger.info(`[MARKETPLACE:PURCHASE] Purchase completed successfully`, {
            derivative_id: derivativeId,
            buyer_wallet: buyerWallet,
            asset_id: assetId,
            ip_id: ipId,
            token_id: tokenId,
            transfer_tx_hash: transferTxHash
        });

        res.status(200).json({
            success: true,
            message: 'Purchase successful! NFT minted and transferred.',
            data: {
                asset_id: assetId,
                ip_id: ipId,
                token_id: tokenId,
                mint_tx_hash: txHash,
                transfer_tx_hash: transferTxHash,
                pricing: {
                    total_paid: basePrice,
                    platform_fee: platformFee,
                    original_owner_royalty: royalty,
                    original_owner_wallet: originalOwnerWallet || 'N/A',
                },
                explorer_links: {
                    mint_tx: `https://explorer.story.foundation/tx/${txHash}`,
                    transfer_tx: `https://explorer.story.foundation/tx/${transferTxHash}`,
                },
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
            // Purchase specific derivatives by ID
            derivatives = await Derivative.find({
                derivative_id: { $in: derivativeIds },
                is_minted: false,
            });

            logger.debug(`[MARKETPLACE:BULK_PURCHASE] Found derivatives by IDs`, {
                requested_count: derivativeIds.length,
                found_count: derivatives.length,
                derivative_ids: JSON.stringify(derivatives.map(d => d.derivative_id))
            });
        } else if (filter) {
            // Purchase derivatives by filter
            const queryFilter: any = { is_minted: false };

            if (filter.type) queryFilter.type = filter.type;

            derivatives = await Derivative.find(queryFilter).limit(filter.limit || 10);

            logger.debug(`[MARKETPLACE:BULK_PURCHASE] Found derivatives by filter`, {
                filter: JSON.stringify(queryFilter),
                found_count: derivatives.length,
                derivative_ids: JSON.stringify(derivatives.map(d => d.derivative_id))
            });
        } else {
            return res.status(400).json({
                success: false,
                message: 'Either derivativeIds array or filter object is required.'
            });
        }

        if (derivatives.length === 0) {
            logger.debug(`[MARKETPLACE:BULK_PURCHASE] No available derivatives found`, {
                buyer_wallet: buyerWallet
            });
            return res.status(404).json({ success: false, message: 'No available derivatives found.' });
        }

        const results = [];

        for (const derivative of derivatives) {
            try {
                logger.debug(`[MARKETPLACE:BULK_PURCHASE] Processing derivative ${derivative.derivative_id}`, {
                    derivative_id: derivative.derivative_id,
                    buyer_wallet: buyerWallet
                });

                // Mint and transfer
                const { ipId, tokenId, txHash } = await StoryService.registerAndMintIpAsset(derivative);
                const transferTxHash = await StoryService.transferNftToBuyer(tokenId, buyerWallet as `0x${string}`);

                // Update derivative
                derivative.ip_id = ipId;
                derivative.token_id = tokenId;
                derivative.is_minted = true;
                await derivative.save();

                // Create asset
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
                    purchase_price: basePrice,
                    purchase_tx_hash: transferTxHash,
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

                logger.debug(`[MARKETPLACE:BULK_PURCHASE] Successfully processed derivative ${derivative.derivative_id}`, {
                    derivative_id: derivative.derivative_id,
                    asset_id: assetId,
                    token_id: tokenId
                });

                results.push({
                    success: true,
                    derivative_id: derivative.derivative_id,
                    asset_id: assetId,
                    token_id: tokenId,
                    ip_id: ipId,
                });
            } catch (error) {
                logger.error(`[MARKETPLACE:BULK_PURCHASE] Failed to process derivative ${derivative.derivative_id}`, {
                    derivative_id: derivative.derivative_id,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });

                results.push({
                    success: false,
                    derivative_id: derivative.derivative_id,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }

        // Update buyer's assets
        let buyer = await User.findOne({ walletAddress: buyerWallet.toLowerCase() });
        const successfulAssetIds = results.filter(r => r.success).map(r => r.asset_id);

        if (!buyer) {
            buyer = new User({
                walletAddress: buyerWallet.toLowerCase(),
                devices: [],
                assets: successfulAssetIds,
            });
        } else {
            buyer.assets.push(...successfulAssetIds);
        }

        await buyer.save();

        logger.info(`[MARKETPLACE:BULK_PURCHASE] Bulk purchase completed`, {
            buyer_wallet: buyerWallet,
            total_requested: derivatives.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results: JSON.stringify(results)
        });

        res.status(200).json({
            success: true,
            message: 'Bulk purchase completed.',
            data: {
                total: derivatives.length,
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

        if (!derivative || !derivative.is_minted || !derivative.token_id) {
            logger.debug(`[MARKETPLACE:DOWNLOAD] Derivative not found or not minted`, {
                derivative_id: derivativeId,
                found: !!derivative,
                is_minted: derivative?.is_minted,
                token_id: derivative?.token_id
            });
            return res.status(404).json({ success: false, message: 'Minted derivative not found.' });
        }

        logger.debug(`[MARKETPLACE:DOWNLOAD] Verifying ownership`, {
            derivative_id: derivativeId,
            token_id: derivative.token_id,
            wallet_address: walletAddress
        });

        const isOwner = await StoryService.verifyOwnership(derivative.token_id, walletAddress as `0x${string}`);

        logger.debug(`[MARKETPLACE:DOWNLOAD] Ownership verification result`, {
            derivative_id: derivativeId,
            token_id: derivative.token_id,
            wallet_address: walletAddress,
            is_owner: isOwner
        });

        if (!isOwner) {
            return res.status(403).json({ success: false, message: 'You do not own the NFT for this derivative.' });
        }

        logger.info(`[MARKETPLACE:DOWNLOAD] Download access granted`, {
            derivative_id: derivativeId,
            wallet_address: walletAddress
        });

        res.status(200).json({
            success: true,
            message: 'Ownership verified. Download access granted.',
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
