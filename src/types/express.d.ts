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

export {};