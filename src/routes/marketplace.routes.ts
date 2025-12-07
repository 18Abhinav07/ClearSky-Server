import { Router } from 'express';
import * as marketplaceController from '../controllers/marketplace.controller';
import { authenticate } from '../middleware/auth'; // Assuming a generic auth middleware exists

const router = Router();

// @route   GET /api/v1/marketplace/derivatives
// @desc    List all available monthly derivatives for sale
// @access  Public
router.get('/derivatives', marketplaceController.listDerivatives);

// @route   POST /api/v1/marketplace/purchase/:derivativeId
// @desc    Purchase and mint a derivative
// @access  Public (or authenticated, depending on product requirements)
router.post('/purchase/:derivativeId', marketplaceController.purchaseDerivative);

// @route   GET /api/v1/marketplace/download/:derivativeId
// @desc    Download derivative content after verifying ownership
// @access  Authenticated
router.get(
    '/download/:derivativeId',
    authenticate, // This middleware should attach the user's wallet address to the request
    marketplaceController.downloadDerivative
);

export default router;
