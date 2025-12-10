import { Router } from 'express';
import * as marketplaceController from '../controllers/marketplace.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// --- Platform Derivatives ---

router.get('/derivatives', marketplaceController.listDerivatives);
router.get('/derivatives/:derivativeId', marketplaceController.getDerivativeDetails);
router.post('/purchase/:derivativeId', marketplaceController.purchaseDerivative);
router.post('/purchase/bulk', marketplaceController.bulkPurchaseDerivatives);
router.get('/assets/:walletAddress', marketplaceController.getUserAssets);
router.get('/download/:derivativeId', authenticate, marketplaceController.downloadDerivative);

// --- User-Created Derivatives ---

// @route   POST /api/v1/marketplace/derivatives/create
// @desc    Create a new derivative from a licensed asset
// @access  Authenticated
router.post('/derivatives/create', authenticate, marketplaceController.createUserDerivative);

// @route   GET /api/v1/marketplace/derivatives/my-creations/:walletAddress
// @desc    List all derivatives created by a specific user
// @access  Public
router.get('/derivatives/my-creations/:walletAddress', marketplaceController.listUserCreations);

// @route   GET /api/v1/marketplace/derivatives/community
// @desc    Browse all listed user-created derivatives
// @access  Public
router.get('/derivatives/community', marketplaceController.browseUserDerivatives);

// @route   POST /api/v1/marketplace/derivatives/purchase/:userDerivativeId
// @desc    Purchase a license for a user-created derivative
// @access  Public
router.post('/derivatives/purchase/:userDerivativeId', marketplaceController.purchaseUserDerivative);


export default router;
