import { Router } from 'express';
import {
  getCities,
  getStations,
  getSensors
} from '@/controllers/config.controller';

const router = Router();

router.get('/cities', getCities);
router.get('/stations/:city_id', getStations);
router.get('/sensors/:station_id', getSensors);

export default router;
