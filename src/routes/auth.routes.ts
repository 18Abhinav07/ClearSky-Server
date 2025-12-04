import { Router } from 'express';
import { login, refreshToken, logout } from '@/controllers/auth.controller';
import { authenticate } from '@/middleware/auth';

const router = Router();

router.post('/login', login);
router.post('/refresh', refreshToken);
router.post('/logout', authenticate, logout);

export default router;