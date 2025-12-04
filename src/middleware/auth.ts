import { Request, Response, NextFunction } from 'express';
import { validateSession } from '@/services/auth.service';

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: { message: 'No token provided' },
    });
    return;
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const validation = await validateSession(token);

    if (!validation.valid) {
      res.status(401).json({
        success: false,
        error: { message: validation.error || 'Invalid token' },
      });
      return;
    }

    // Attach user to request
    req.user = {
      wallet_id: validation.payload!.wallet_id,
      jti: validation.payload!.jti,
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({
      success: false,
      error: { message: 'Authentication failed' },
    });
  }
};