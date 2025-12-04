import { AccessTokenPayload } from '@/types/token.types';

declare global {
  namespace Express {
    interface Request {
      user?: {
        walletAddress: string;
        jti: string;
      };
    }
  }
}