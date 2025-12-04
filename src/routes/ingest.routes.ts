import { Router } from 'express';
import {
  ingestData,
  getDeviceReadingsController,
  getReadingsByStatusController,
  getReadingByIdController
} from '@/controllers/aqi-ingestion.controller';
import { authenticate } from '@/middleware/auth';

const router = Router();

// All ingestion routes require authentication
router.use(authenticate);

router.post('/ingest', ingestData);
router.get('/readings/:device_id', getDeviceReadingsController);
router.get('/readings/status/:status', getReadingsByStatusController);
router.get('/reading/:reading_id', getReadingByIdController);

export default router;
