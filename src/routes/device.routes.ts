import { Router } from 'express';
import { createDevice, getDevices } from '@/controllers/device.controller';
import { protect } from '@/middleware/auth';

const router = Router();

router.route('/').post(protect, createDevice).get(protect, getDevices);

// The guide mentions a DELETE route, but no controller logic is provided.
// I will add a placeholder for it.
router.route('/:deviceId').delete(protect, (req, res) => {
  res.status(501).json({ success: false, error: { message: 'Not Implemented' } });
});

export default router;
