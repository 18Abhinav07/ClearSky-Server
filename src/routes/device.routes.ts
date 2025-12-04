import { Router } from 'express';
import {
  registerDevice,
  getDevices,
  deleteDevice
} from '@/controllers/device.controller';
import { authenticate } from '@/middleware/auth';

const router = Router();

// All device routes require authentication
router.use(authenticate);

router.post('/register', registerDevice);
router.get('/', getDevices);
router.delete('/:device_id', deleteDevice);

export default router;