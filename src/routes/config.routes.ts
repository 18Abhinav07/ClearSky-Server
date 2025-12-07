import { Router } from 'express';
import {
  getPresets,
  getCities,
  getStations,
  getSensors
} from '@/controllers/config.controller';

const router = Router();

// Unified endpoint - returns all configuration data
router.get('/presets', getPresets);

// Legacy individual endpoints (kept for backwards compatibility)
router.get('/cities', getCities);
router.get('/stations/:city_id', getStations);
router.get('/sensors/:station_id', getSensors);

export default router;
