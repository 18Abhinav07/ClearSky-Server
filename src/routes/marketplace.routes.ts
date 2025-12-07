import { Router } from 'express';
import * as marketplaceController from '../controllers/marketplace.controller';
import { authenticate } from '../middleware/auth'; // Assuming a generic auth middleware exists

const router = Router();

// @route   GET /api/v1/marketplace/derivatives
// @desc    List all available derivatives for sale with filtering
// @access  Public
router.get('/derivatives', marketplaceController.listDerivatives);

// @route   GET /api/v1/marketplace/derivatives/:derivativeId
// @desc    Get detailed information about a specific derivative
// @access  Public
router.get('/derivatives/:derivativeId', marketplaceController.getDerivativeDetails);

// @route   POST /api/v1/marketplace/purchase/:derivativeId
// @desc    Purchase and mint a single derivative
// @access  Public (or authenticated, depending on product requirements)
router.post('/purchase/:derivativeId', marketplaceController.purchaseDerivative);

// @route   POST /api/v1/marketplace/purchase/bulk
// @desc    Bulk purchase multiple derivatives by ID or filter
// @access  Public
router.post('/purchase/bulk', marketplaceController.bulkPurchaseDerivatives);

// @route   GET /api/v1/marketplace/assets/:walletAddress
// @desc    Get all assets owned by a wallet address
// @access  Public
router.get('/assets/:walletAddress', marketplaceController.getUserAssets);

// @route   GET /api/v1/marketplace/download/:derivativeId
// @desc    Download derivative content after verifying ownership
// @access  Authenticated
router.get(
    '/download/:derivativeId',
    authenticate, // This middleware should attach the user's wallet address to the request
    marketplaceController.downloadDerivative
);

export default router;
