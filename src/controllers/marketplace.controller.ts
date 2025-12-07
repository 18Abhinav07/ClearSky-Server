import { Request, Response } from 'express';
import * as DerivativeRepository from '../database/derivative.repository';
import * as StoryService from '../services/story.service';
import { Derivative } from '../models/Derivative';
import { logger } from '../utils/logger';

/**
 * Lists all available (MONTHLY) derivatives for sale.
 */
export const listDerivatives = async (req: Request, res: Response) => {
    try {
        const derivatives = await Derivative.find({ type: 'MONTHLY' }).lean();
        res.status(200).json({
            success: true,
            data: derivatives,
        });
    } catch (error) {
        logger.error('Failed to list derivatives:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * Handles the purchase of a derivative, which triggers the on-demand minting.
 */
export const purchaseDerivative = async (req: Request, res: Response) => {
    try {
        const { derivativeId } = req.params;
        const { buyerWallet } = req.body;

        if (!buyerWallet) {
            return res.status(400).json({ success: false, message: 'Buyer wallet address is required.' });
        }

        const derivative = await Derivative.findOne({ derivative_id: derivativeId });

        if (!derivative) {
            return res.status(404).json({ success: false, message: 'Derivative not found.' });
        }

        if (derivative.is_minted) {
            return res.status(400).json({ success: false, message: 'This derivative has already been minted.' });
        }

        logger.info(`Purchase request received for derivative ${derivativeId} by ${buyerWallet}`);

        const { ipId, tokenId, txHash } = await StoryService.registerAndMintIpAsset(derivative);
        await StoryService.transferNftToBuyer(tokenId, buyerWallet as `0x${string}`);

        derivative.ip_id = ipId;
        derivative.token_id = tokenId;
        derivative.is_minted = true;
        await derivative.save();

        res.status(200).json({
            success: true,
            message: 'Purchase successful and NFT minted.',
            data: { ipId, tokenId, transactionHash: txHash },
        });
    } catch (error) {
        logger.error(`Purchase failed for derivative ${req.params.derivativeId}:`, error);
        res.status(500).json({ success: false, message: 'Server error during purchase.' });
    }
};

/**
 * Allows the owner of a derivative NFT to download the associated data.
 */
export const downloadDerivative = async (req: Request, res: Response) => {
    try {
        const { derivativeId } = req.params;
        const walletAddress = req.user?.walletAddress;

        if (!walletAddress) {
            return res.status(401).json({ success: false, message: 'Unauthorized. Wallet address is missing.' });
        }

        const derivative = await Derivative.findOne({ derivative_id: derivativeId });

        if (!derivative || !derivative.is_minted || !derivative.token_id) {
            return res.status(404).json({ success: false, message: 'Minted derivative not found.' });
        }

        const isOwner = await StoryService.verifyOwnership(derivative.token_id, walletAddress as `0x${string}`);

        if (!isOwner) {
            return res.status(403).json({ success: false, message: 'You do not own the NFT for this derivative.' });
        }

        res.status(200).json({
            success: true,
            message: 'Ownership verified.',
            data: {
                content: derivative.content,
                processing: derivative.processing,
            },
        });
    } catch (error) {
        logger.error(`Download failed for derivative ${req.params.derivativeId}:`, error);
        res.status(500).json({ success: false, message: 'Server error during download.' });
    }
};
