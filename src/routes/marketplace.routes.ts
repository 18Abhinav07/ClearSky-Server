import { Router } from 'express';
import * as marketplaceController from '../controllers/marketplace.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// --- Platform Derivatives ---

router.get('/derivatives', marketplaceController.listDerivatives);

// --- User-Created Derivatives (specific routes before parameterized ones) ---

// @route   GET /api/v1/marketplace/derivatives/community
// @desc    Browse all listed user-created derivatives
// @access  Public
router.get('/derivatives/community', marketplaceController.browseUserDerivatives);

// @route   POST /api/v1/marketplace/derivatives/create
// @desc    Create a new derivative from a licensed asset
// @access  Authenticated
router.post('/derivatives/create', authenticate, marketplaceController.createUserDerivative);

// @route   GET /api/v1/marketplace/derivatives/:derivativeId
// @desc    Get detailed information about a specific derivative
// @access  Public
router.get('/derivatives/:derivativeId', marketplaceController.getDerivativeDetails);

// --- Platform Purchase Routes ---

router.post('/purchase/:derivativeId', marketplaceController.purchaseDerivative);
router.post('/purchase/bulk', marketplaceController.bulkPurchaseDerivatives);
router.get('/assets/:walletAddress', marketplaceController.getUserAssets);
router.get('/download/:derivativeId', authenticate, marketplaceController.downloadDerivative);

// @route   GET /api/v1/marketplace/:walletAddress/derivatives
// @desc    Get DAILY derivatives created from a user's device readings
// @access  Public
router.get('/:walletAddress/derivatives', marketplaceController.getUserDeviceDerivatives);

// @route   POST /api/v1/marketplace/derivatives/purchase/:userDerivativeId
// @desc    Purchase a license for a user-created derivative
// @access  Public
router.post('/derivatives/purchase/:userDerivativeId', marketplaceController.purchaseUserDerivative);


export default router;
