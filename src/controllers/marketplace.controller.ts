import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Address } from 'viem';

import * as DerivativeRepository from '../database/derivative.repository';
import * as StoryService from '../services/story.service';
import * as IpfsService from '../services/ipfs.service';
import { Derivative } from '../models/Derivative';
import Asset from '../models/Asset';
import User from '../models/User';
import UserDerivative from '../models/UserDerivative';
import UserDerivativeSale from '../models/UserDerivativeSale';
import AQIReading from '../models/AQIReading';
import { logger } from '../utils/logger';
import { computeContentHash } from '../utils/hash.utils';
import { IAQIReading } from '../types/aqi-reading.types';

// Platform configuration
const PLATFORM_FEE_PERCENTAGE = 10; // 10% platform fee
const ORIGINAL_OWNER_ROYALTY_PERCENTAGE = 5; // 5% royalty to original data owner

/**
 * Normalizes derivative type input to match enum values
 * Handles: 'creative', 'creative_derivative', etc. -> 'CREATIVE'
 */
function normalizeDerivativeType(input: string): string {
    // Remove underscores and convert to uppercase
    const normalized = input.replace(/_/g, ' ').toUpperCase().trim();

    // Map common variations
    const typeMap: Record<string, string> = {
        'CREATIVE': 'CREATIVE',
        'CREATIVE DERIVATIVE': 'CREATIVE',
        'MODEL': 'MODEL',
        'DATASET': 'DATASET',
        'DATA SET': 'DATASET',
        'ANALYSIS': 'ANALYSIS',
        'VISUALIZATION': 'VISUALIZATION',
        'VIS': 'VISUALIZATION',
        'REPORT': 'REPORT',
        'APPLICATION': 'APPLICATION',
        'APP': 'APPLICATION',
        'OTHER': 'OTHER',
    };

    return typeMap[normalized] || 'OTHER';
}

/**
 * Lists all available (MONTHLY) derivatives for sale with filtering and search capabilities.
 */
export const listDerivatives = async (req: Request, res: Response) => {
    try {
        logger.info(
            `[MARKETPLACE:LIST] Function called ${JSON.stringify({
                path: req.path,
                params: req.params,
                query: req.query
            })}`
        );
        logger.debug(
            `[MARKETPLACE] Listing derivatives request received ${JSON.stringify({
                query: req.query
            })}`
        );

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

        logger.debug(
            `[MARKETPLACE] Filter constructed ${JSON.stringify({
                filter: filter
            })}`
        );

        const derivatives = await Derivative.find(filter)
            .limit(parseInt(limit as string))
            .skip(parseInt(offset as string))
            .sort({ created_at: -1 })
            .lean();

        logger.debug(
            `[MARKETPLACE] Found ${derivatives.length} derivatives ${JSON.stringify({
                count: derivatives.length,
                filter: filter
            })}`
        );

        // Enrich derivatives with metadata
        const enrichedDerivatives = await Promise.all(
            derivatives.map(async (deriv) => {
                logger.debug(
                    `[MARKETPLACE] Enriching derivative ${
                        deriv.derivative_id
                    } ${JSON.stringify({
                        derivative_id: deriv.derivative_id,
                        parent_data_ids: deriv.parent_data_ids
                    })}`
                );

                // Fetch primitive data for this derivative
                const primitiveData = await AQIReading.find({
                    reading_id: { $in: deriv.parent_data_ids }
                }).lean();

                logger.debug(
                    `[MARKETPLACE] Found ${
                        primitiveData.length
                    } primitive readings for derivative ${
                        deriv.derivative_id
                    } ${JSON.stringify({
                        derivative_id: deriv.derivative_id,
                        primitive_count: primitiveData.length,
                        primitive_ids: primitiveData.map(
                            (p: IAQIReading) => p.reading_id
                        )
                    })}`
                );

                return {
                    ...deriv,
                    primitive_data: primitiveData,
                    owner: deriv.is_minted ? 'Sold' : 'Available',
                };
            })
        );

        logger.debug(
            `[MARKETPLACE] Successfully enriched all derivatives ${JSON.stringify({
                total_count: enrichedDerivatives.length
            })}`
        );

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
        logger.error(
            `[MARKETPLACE] Failed to list derivatives: ${JSON.stringify(error)}`
        );
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * Get detailed information about a specific derivative
 */
export const getDerivativeDetails = async (req: Request, res: Response) => {
    try {
        const { derivativeId } = req.params;

        logger.info(
            `[MARKETPLACE:DETAILS] Function called ${JSON.stringify({
                path: req.path,
                params: req.params,
                query: req.query,
                derivativeId
            })}`
        );
        logger.debug(
            `[MARKETPLACE] Get derivative details request ${JSON.stringify({
                derivative_id: derivativeId
            })}`
        );

        const derivative = await Derivative.findOne({ derivative_id: derivativeId }).lean();

        if (!derivative) {
            logger.debug(
                `[MARKETPLACE] Derivative not found ${JSON.stringify({
                    derivative_id: derivativeId
                })}`
            );
            return res.status(404).json({ success: false, message: 'Derivative not found.' });
        }

        // Fetch primitive data
        const primitiveData = await AQIReading.find({
            reading_id: { $in: derivative.parent_data_ids }
        }).lean();

        logger.debug(
            `[MARKETPLACE] Derivative details retrieved ${JSON.stringify({
                derivative_id: derivativeId,
                // derivative: derivative,
                primitive_data_count: primitiveData.length,
                // primitive_data: primitiveData
            })}`
        );

        res.status(200).json({
            success: true,
            data: {
                ...derivative,
                primitive_data: primitiveData,
            },
        });
    } catch (error) {
        logger.error(
            `[MARKETPLACE] Failed to get derivative details: ${JSON.stringify(
                error
            )}`
        );
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

        logger.debug(
            `[MARKETPLACE:PURCHASE] Purchase initiated ${JSON.stringify({
                derivative_id: derivativeId,
                buyer_wallet: buyerWallet,
                request_body: req.body
            })}`
        );

        if (!buyerWallet) {
            logger.debug(
                `[MARKETPLACE:PURCHASE] Missing buyer wallet ${JSON.stringify({
                    derivative_id: derivativeId
                })}`
            );
            return res.status(400).json({ success: false, message: 'Buyer wallet address is required.' });
        }

        if (!/^0x[a-fA-F0-9]{40}$/.test(buyerWallet)) {
            logger.debug(
                `[MARKETPLACE:PURCHASE] Invalid wallet format ${JSON.stringify({
                    derivative_id: derivativeId,
                    buyer_wallet: buyerWallet
                })}`
            );
            return res.status(400).json({ success: false, message: 'Invalid wallet address format.' });
        }

        const derivative = await Derivative.findOne({ derivative_id: derivativeId });

        if (!derivative) {
            logger.debug(
                `[MARKETPLACE:PURCHASE] Derivative not found ${JSON.stringify({
                    derivative_id: derivativeId
                })}`
            );
            return res.status(404).json({ success: false, message: 'Derivative not found.' });
        }

        if (derivative.is_minted) {
            logger.debug(
                `[MARKETPLACE:PURCHASE] Derivative already processed ${JSON.stringify(
                    {
                        derivative_id: derivativeId
                    }
                )}`
            );
            return res.status(400).json({ success: false, message: 'This derivative has already been sold.' });
        }

        const primitiveReadings = await AQIReading.find({
            reading_id: { $in: derivative.parent_data_ids }
        }).lean();

        const originalOwnerWallet = primitiveReadings[0]?.owner_id || null;

        const basePrice = 100;
        const platformFee = (basePrice * PLATFORM_FEE_PERCENTAGE) / 100;
        const royalty = (basePrice * ORIGINAL_OWNER_ROYALTY_PERCENTAGE) / 100;

        logger.info(
            `[MARKETPLACE:PURCHASE] Starting IP Asset registration ${JSON.stringify(
                {
                    derivative_id: derivativeId
                }
            )}`
        );

        // STEP 1: Register IP Asset (Platform owns)
        const { ipId, tokenId, txHash } = await StoryService.registerAndMintIpAsset(derivative);
        logger.debug(
            `[MARKETPLACE:PURCHASE] IP Asset registered ${JSON.stringify({
                derivative_id: derivativeId,
                ip_id: ipId,
                token_id: tokenId
            })}`
        );

        // STEP 2: Attach License Terms with revenue share
        const { licenseTermsId, txHash: licenseTermsTxHash } = await StoryService.attachLicenseTerms({
            ipId,
            commercialRevShare,
        });
        logger.debug(
            `[MARKETPLACE:PURCHASE] License terms attached ${JSON.stringify({
                derivative_id: derivativeId,
                ip_id: ipId,
                license_terms_id: licenseTermsId
            })}`
        );

        // STEP 3: Mint License Token for buyer
        const { licenseTokenId, txHash: licenseTxHash } = await StoryService.mintLicenseToken({
            ipId,
            licenseTermsId,
            buyerWallet: buyerWallet as `0x${string}`,
            amount: 1,
        });
        logger.debug(
            `[MARKETPLACE:PURCHASE] License token minted for buyer ${JSON.stringify(
                {
                    derivative_id: derivativeId,
                    license_token_id: licenseTokenId
                }
            )}`
        );

        // STEP 4: Update derivative record
        derivative.ip_id = ipId;
        derivative.token_id = tokenId;
        derivative.license_terms_id = licenseTermsId;
        derivative.is_minted = true;
        await derivative.save();
        logger.debug(
            `[MARKETPLACE:PURCHASE] Derivative record updated ${JSON.stringify({
                derivative_id: derivativeId
            })}`
        );

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
        logger.debug(
            `[MARKETPLACE:PURCHASE] Asset record created ${JSON.stringify({
                asset_id: assetId
            })}`
        );

        // Step 6: Update buyer's user record
        let buyer = await User.findOne({ walletAddress: buyerWallet.toLowerCase() });
        if (!buyer) {
            buyer = new User({ walletAddress: buyerWallet.toLowerCase(), devices: [], assets: [assetId] });
        } else {
            buyer.assets.push(assetId);
        }
        await buyer.save();
        logger.debug(
            `[MARKETPLACE:PURCHASE] Buyer user record updated ${JSON.stringify({
                buyer_wallet: buyerWallet
            })}`
        );

        logger.info(
            `[MARKETPLACE:PURCHASE] Purchase completed successfully ${JSON.stringify(
                {
                    derivative_id: derivativeId,
                    asset_id: assetId,
                    ip_id: ipId,
                    license_token_id: licenseTokenId
                }
            )}`
        );

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
        logger.error(
            `[MARKETPLACE:PURCHASE] Purchase failed for derivative ${
                req.params.derivativeId
            }: ${JSON.stringify({
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
                derivative_id: req.params.derivativeId,
                buyer_wallet: req.body.buyerWallet
            })}`
        );
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

        logger.debug(
            `[MARKETPLACE:BULK_PURCHASE] Bulk purchase initiated ${JSON.stringify(
                {
                    buyer_wallet: buyerWallet,
                    derivative_ids: derivativeIds,
                    filter: filter
                }
            )}`
        );

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
                logger.debug(
                    `[MARKETPLACE:BULK_PURCHASE] Processing derivative ${derivative.derivative_id}`
                );

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
                logger.error(
                    `[MARKETPLACE:BULK_PURCHASE] Failed to process derivative ${
                        derivative.derivative_id
                    } ${JSON.stringify({
                        error:
                            error instanceof Error
                                ? error.message
                                : 'Unknown error'
                    })}`
                );
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

        logger.info(
            `[MARKETPLACE:BULK_PURCHASE] Bulk purchase completed ${JSON.stringify(
                {
                    buyer_wallet: buyerWallet,
                    successful_count: results.filter((r) => r.success).length,
                    failed_count: results.filter((r) => !r.success).length
                }
            )}`
        );

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
        logger.error(
            `[MARKETPLACE:BULK_PURCHASE] Bulk purchase failed: ${JSON.stringify(
                error
            )}`
        );
        res.status(500).json({ success: false, message: 'Server error during bulk purchase.' });
    }
};

/**
 * Get all assets owned by a user
 */
export const getUserAssets = async (req: Request, res: Response) => {
    try {
        const { walletAddress } = req.params;

        logger.debug(
            `[MARKETPLACE] Get user assets request ${JSON.stringify({
                wallet_address: walletAddress
            })}`
        );

        const assets = await Asset.find({ owner_wallet: walletAddress.toLowerCase() }).lean();

        logger.debug(
            `[MARKETPLACE] Found ${assets.length} assets for user ${JSON.stringify(
                {
                    wallet_address: walletAddress,
                    asset_count: assets.length,
                    assets: assets
                }
            )}`
        );

        res.status(200).json({
            success: true,
            data: assets,
        });
    } catch (error) {
        logger.error(
            `[MARKETPLACE] Failed to get user assets: ${JSON.stringify(error)}`
        );
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

        logger.debug(
            `[MARKETPLACE:DOWNLOAD] Download request received ${JSON.stringify({
                derivative_id: derivativeId,
                wallet_address: walletAddress
            })}`
        );

        if (!walletAddress) {
            logger.debug(
                `[MARKETPLACE:DOWNLOAD] Missing wallet address ${JSON.stringify({
                    derivative_id: derivativeId
                })}`
            );
            return res.status(401).json({ success: false, message: 'Unauthorized. Wallet address is missing.' });
        }

        const derivative = await Derivative.findOne({ derivative_id: derivativeId });

        if (!derivative || !derivative.is_minted || !derivative.ip_id) {
            logger.debug(
            `[MARKETPLACE:DOWNLOAD] Derivative not found, not minted, or has no IP ID ${JSON.stringify(
                {
                    derivative_id: derivativeId,
                    found: !!derivative,
                    is_minted: derivative?.is_minted,
                    ip_id: derivative?.ip_id
                }
            )}`
        );
            return res.status(404).json({ success: false, message: 'Sold derivative not found.' });
        }

        logger.debug(
            `[MARKETPLACE:DOWNLOAD] Verifying license ownership ${JSON.stringify({
                derivative_id: derivativeId,
                ip_id: derivative.ip_id,
                wallet_address: walletAddress
            })}`
        );

        const hasLicense = await StoryService.verifyLicenseOwnership(derivative.ip_id as `0x${string}`, walletAddress as `0x${string}`);

        logger.debug(
            `[MARKETPLACE:DOWNLOAD] License verification result ${JSON.stringify(
                {
                    derivative_id: derivativeId,
                    ip_id: derivative.ip_id,
                    wallet_address: walletAddress,
                    has_license: hasLicense
                }
            )}`
        );

        if (!hasLicense) {
            return res.status(403).json({ success: false, message: 'You do not have a valid license to download this derivative.' });
        }

        logger.info(
            `[MARKETPLACE:DOWNLOAD] Download access granted ${JSON.stringify({
                derivative_id: derivativeId,
                wallet_address: walletAddress
            })}`
        );

        res.status(200).json({
            success: true,
            message: 'License verified. Download access granted.',
            data: {
                content: derivative.content,
                processing: derivative.processing,
            },
        });
    } catch (error) {
        logger.error(
            `[MARKETPLACE:DOWNLOAD] Download failed for derivative ${
                req.params.derivativeId
            }: ${JSON.stringify(error)}`
        );
        res.status(500).json({ success: false, message: 'Server error during download.' });
    }
};


// --- User-Created Derivatives ---

export const createUserDerivative = async (req: Request, res: Response) => {
    try {
        const { parentAssetId, title, description, derivativeType, contentUri, price, creatorRevShare } = req.body;
        const creatorWallet = req.user?.walletAddress;

        if (!creatorWallet) {
            return res.status(401).json({ success: false, message: 'Unauthorized. Please authenticate first.' });
        }

        logger.debug(
            `[USER_DERIVATIVE:CREATE] Request received ${JSON.stringify({
                parentAssetId,
                creatorWallet,
                body: req.body
            })}`
        );

        // 1. Verify user owns license to parent asset
        const parentAsset = await Asset.findOne({ asset_id: parentAssetId });
        if (!parentAsset || parentAsset.owner_wallet !== creatorWallet.toLowerCase()) {
            return res.status(403).json({ success: false, message: 'You must own a license to this asset to create a derivative.' });
        }

        // 2. Verify license allows derivative creation
        const canCreate = await StoryService.verifyLicenseOwnership(
            parentAsset.ip_id as `0x${string}`,
            creatorWallet as `0x${string}`
        );

        if (!canCreate) {
            return res.status(403).json({ success: false, message: 'Your license does not allow derivative creation, or ownership could not be verified.' });
        }

        // 3. Prepare metadata and upload to IPFS
        const metadata = {
            title,
            description,
            derivativeType,
            contentUri, // The URI of the actual content (e.g. model file)
            creator: creatorWallet,
        };
        const contentHash = computeContentHash(metadata);
        const { ipfsHash, ipfsUri } = await IpfsService.pinJSONToIPFS(metadata, { name: `UserDerivative: ${title}` });

        // 4. Register as child IP on Story Protocol
        const { childIpId, childTokenId, txHash } = await StoryService.registerDerivativeIp({
            parentIpId: parentAsset.ip_id as Address,
            parentLicenseTermsId: parentAsset.license_terms_id,
            creatorWallet: creatorWallet as Address,
            metadata: { ipfs_uri: ipfsUri, content_hash: `0x${contentHash}` },
        });

        logger.debug(
            `[USER_DERIVATIVE:CREATE] Child IP registered ${JSON.stringify({
                childIpId,
                childTokenId
            })}`
        );

        // 5. Attach license terms to child IP (so they can sell it)
        const { licenseTermsId } = await StoryService.attachLicenseTerms({
            ipId: childIpId,
            commercialRevShare: creatorRevShare,
        });

        // 6. Create UserDerivative record
        const normalizedType = normalizeDerivativeType(derivativeType);
        const userDerivative = new UserDerivative({
            creator_wallet: creatorWallet.toLowerCase(),
            parent_asset_id: parentAssetId,
            parent_ip_id: parentAsset.ip_id,
            child_ip_id: childIpId,
            child_token_id: childTokenId,
            title,
            description,
            derivative_type: normalizedType,
            content_uri: contentUri,
            ipfs_hash: ipfsHash,
            price,
            creator_rev_share: creatorRevShare,
            license_terms_id: licenseTermsId,
            is_listed: true,
        });
        await userDerivative.save();

        // 7. Update parent asset
        await Asset.updateOne(
            { asset_id: parentAssetId },
            { $push: { used_in_derivatives: userDerivative.user_derivative_id } }
        );

        logger.info(
            `[USER_DERIVATIVE:CREATE] Created successfully ${JSON.stringify({
                userDerivativeId: userDerivative.user_derivative_id,
                childIpId
            })}`
        );

        res.status(201).json({
            success: true,
            message: 'Derivative created and listed successfully!',
            data: {
                user_derivative_id: userDerivative.user_derivative_id,
                child_ip_id: childIpId,
                child_token_id: childTokenId,
                tx_hash: txHash,
                royalty_info: {
                    platform_earns: `Platform automatically receives 10% of all sales via parent IP relationship.`,
                    creator_earns: `${creatorRevShare}% of further derivatives from your new IP.`,
                },
            },
        });

    } catch (error) {
        logger.error(
            `[USER_DERIVATIVE:CREATE] Failed to create user derivative: ${JSON.stringify(
                {
                    error:
                        error instanceof Error ? error.message : 'Unknown error',
                    stack: error instanceof Error ? error.stack : undefined
                }
            )}`
        );
        res.status(500).json({ success: false, message: 'Server error during derivative creation.' });
    }
};

export const purchaseUserDerivative = async (req: Request, res: Response) => {
    try {
        const { userDerivativeId } = req.params;
        const { buyerWallet } = req.body;

        logger.debug(
            `[USER_DERIVATIVE:PURCHASE] Purchase initiated ${JSON.stringify({
                userDerivativeId,
                buyerWallet
            })}`
        );

        if (!buyerWallet) {
            return res.status(400).json({ success: false, message: 'Buyer wallet address is required.' });
        }

        const userDerivative = await UserDerivative.findOne({ user_derivative_id: userDerivativeId });

        if (!userDerivative || !userDerivative.is_listed) {
            return res.status(404).json({ success: false, message: 'This user-created derivative is not available for purchase.' });
        }

        // 1. Mint license token for buyer
        const { licenseTokenId, txHash } = await StoryService.mintLicenseToken({
            ipId: userDerivative.child_ip_id as Address,
            licenseTermsId: userDerivative.license_terms_id,
            buyerWallet: buyerWallet as Address,
            amount: 1,
        });

        // 2. Record sale
        const sale = new UserDerivativeSale({
            user_derivative_id: userDerivativeId,
            buyer_wallet: buyerWallet.toLowerCase(),
            price: userDerivative.price,
            license_token_id: licenseTokenId,
        });
        await sale.save();

        // 3. Update derivative stats
        await UserDerivative.updateOne(
            { user_derivative_id: userDerivativeId },
            { $inc: { total_sales: 1, total_revenue: userDerivative.price } }
        );

        // 4. Create asset record for buyer
        const assetId = `asset_${uuidv4()}`;
        const asset = new Asset({
            asset_id: assetId,
            owner_wallet: buyerWallet.toLowerCase(),
            derivative_id: userDerivativeId, // Linking to the user derivative ID
            ip_id: userDerivative.child_ip_id,
            token_id: userDerivative.child_token_id, // This is the NFT of the derivative IP
            license_token_id: licenseTokenId,
            license_terms_id: userDerivative.license_terms_id,
            access_type: 'license',
            purchase_price: userDerivative.price,
            purchase_tx_hash: txHash,
            can_create_derivatives: true, // License grants right to create more derivatives
        });
        await asset.save();
        
        // 5. Update buyer's user record
        await User.updateOne(
            { walletAddress: buyerWallet.toLowerCase() },
            { $push: { assets: assetId } },
            { upsert: true }
        );

        logger.info(
            `[USER_DERIVATIVE:PURCHASE] Sale completed ${JSON.stringify({
                user_derivative_id: userDerivativeId,
                buyer: buyerWallet,
                price: userDerivative.price,
                asset_id: assetId
            })}`
        );

        res.status(200).json({
            success: true,
            message: 'User derivative licensed successfully!',
            data: {
                asset_id: assetId,
                license_token_id: licenseTokenId,
                tx_hash: txHash,
                you_can_now: 'Create your own derivatives from this asset!',
                royalty_info: {
                    creator_earns: `${userDerivative.creator_rev_share}% if you create derivatives from this.`,
                    platform_earns: '10% from the entire chain is captured automatically by the root license.',
                },
            },
        });

    } catch (error) {
        logger.error(
            `[USER_DERIVATIVE:PURCHASE] Failed to purchase user derivative: ${JSON.stringify(
                {
                    error:
                        error instanceof Error ? error.message : 'Unknown error',
                    stack: error instanceof Error ? error.stack : undefined
                }
            )}`
        );
        res.status(500).json({ success: false, message: 'Server error during user derivative purchase.' });
    }
};

export const listUserCreations = async (req: Request, res: Response) => {
    try {
        const { walletAddress } = req.params;
        const userDerivatives = await UserDerivative.find({ creator_wallet: walletAddress.toLowerCase() }).lean();

        res.status(200).json({
            success: true,
            data: userDerivatives,
        });

    } catch (error) {
        logger.error(
            `[USER_DERIVATIVE:LIST_CREATIONS] Failed to list user creations: ${JSON.stringify(
                {
                    error:
                        error instanceof Error ? error.message : 'Unknown error'
                }
            )}`
        );
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

export const browseUserDerivatives = async (req: Request, res: Response) => {
    try {
        const { derivativeType, minPrice, maxPrice, creatorWallet } = req.query;
        const filter: any = { is_listed: true };

        if (derivativeType) filter.derivative_type = derivativeType;
        if (creatorWallet) filter.creator_wallet = (creatorWallet as string).toLowerCase();
        if (minPrice) filter.price = { ...filter.price, $gte: Number(minPrice) };
        if (maxPrice) filter.price = { ...filter.price, $lte: Number(maxPrice) };
        
        const userDerivatives = await UserDerivative.find(filter).sort({ createdAt: -1 }).lean();

        res.status(200).json({
            success: true,
            data: userDerivatives,
        });

    } catch (error) {
        logger.error(`[USER_DERIVATIVE:BROWSE] Failed to browse user derivatives:`, {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

/**
 * Get DAILY derivatives created from a user's device readings
 */
export const getUserDeviceDerivatives = async (req: Request, res: Response) => {
    try {
        const { walletAddress } = req.params;

        logger.debug(`[MARKETPLACE:USER_DEVICE_DERIVATIVES] Fetching derivatives for user`, {
            wallet_address: walletAddress
        });

        // Step 1: Find all AQI readings owned by this user that have derivatives
        const userReadings = await AQIReading.find({
            owner_id: walletAddress.toLowerCase(),
            status: { $in: ['DERIVED_INDIVIDUAL', 'COMPLETE'] }
        }).select('reading_id').lean();

        if (userReadings.length === 0) {
            logger.debug(`[MARKETPLACE:USER_DEVICE_DERIVATIVES] No readings found for user`, {
                wallet_address: walletAddress
            });
            return res.status(200).json({
                success: true,
                data: [],
                message: 'No derivatives found for this user'
            });
        }

        const readingIds = userReadings.map(r => r.reading_id);

        logger.debug(`[MARKETPLACE:USER_DEVICE_DERIVATIVES] Found user readings`, {
            wallet_address: walletAddress,
            reading_count: readingIds.length,
            reading_ids: readingIds
        });

        // Step 2: Find DAILY derivatives that include any of these reading IDs
        const derivatives = await Derivative.find({
            type: 'DAILY',
            parent_data_ids: { $in: readingIds }
        }).sort({ created_at: -1 }).lean();

        logger.debug(`[MARKETPLACE:USER_DEVICE_DERIVATIVES] Found derivatives`, {
            wallet_address: walletAddress,
            derivative_count: derivatives.length
        });

        res.status(200).json({
            success: true,
            data: derivatives,
            count: derivatives.length
        });

    } catch (error) {
        logger.error(`[MARKETPLACE:USER_DEVICE_DERIVATIVES] Failed to fetch user device derivatives:`, {
            error: error instanceof Error ? error.message : 'Unknown error',
            wallet_address: req.params.walletAddress
        });
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
