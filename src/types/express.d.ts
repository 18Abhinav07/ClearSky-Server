import { AccessTokenPayload } from '@/types/token.types';

declare global {
  namespace Express {
    interface Request {
      user?: {
        wallet_id: string;
        jti: string;
      };
    }
  }
}