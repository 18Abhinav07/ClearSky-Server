import jwt, { Secret } from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { TOKEN_CONFIG } from '@/config/constants';
import { AccessTokenPayload, RefreshTokenPayload, TokenPair, DecodedToken } from '@/types/token.types';
import { TokenValidationResult } from '@/types/auth.types';
import { redisClient } from '@/redis/client';
import { getRefreshToken } from '@/redis/token.repository';

export interface TokenService {
  generateAccessToken(walletAddress: string): Promise<string>;
  generateRefreshToken(walletAddress: string, family_id?: string): Promise<string>;
  verifyAccessToken(token: string): Promise<TokenValidationResult>;
  verifyRefreshToken(token: string): Promise<TokenValidationResult>;
  generateTokenPair(walletAddress: string): Promise<TokenPair>;
  decodeToken(token: string): DecodedToken | null;
}

const generateJti = () => randomBytes(TOKEN_CONFIG.JTI_LENGTH).toString('hex');
const generateTokenFamily = () => randomBytes(TOKEN_CONFIG.TOKEN_FAMILY_LENGTH).toString('hex');

export const generateAccessToken = async (walletAddress: string): Promise<string> => {
  const jti = generateJti();
  const payload: Omit<AccessTokenPayload, 'iat' | 'exp'> = {
    walletAddress: walletAddress.toLowerCase(),
    token_type: 'access',
    jti,
  };
  return jwt.sign(payload, process.env.JWT_SECRET as Secret, {
    expiresIn: TOKEN_CONFIG.ACCESS_TOKEN_EXPIRY,
  });
};

export const generateRefreshToken = async (walletAddress: string, family_id?: string): Promise<string> => {
  const jti = generateJti();
  const token_family = family_id || generateTokenFamily();
  const payload: Omit<RefreshTokenPayload, 'iat' | 'exp'> = {
    walletAddress: walletAddress.toLowerCase(),
    token_type: 'refresh',
    jti,
    token_family,
  };
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET as Secret, {
    expiresIn: TOKEN_CONFIG.REFRESH_TOKEN_EXPIRY,
  });
};

export const verifyAccessToken = async (token: string): Promise<TokenValidationResult> => {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as Secret) as AccessTokenPayload;
    const isBlacklisted = await redisClient.exists(`${TOKEN_CONFIG.REDIS_KEY_PREFIX.BLACKLIST}:${payload.jti}:revoked`);
    if (isBlacklisted.data) {
      return { valid: false, error: 'Token blacklisted' };
    }
    return { valid: true, payload };
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
};

export const verifyRefreshToken = async (token: string): Promise<TokenValidationResult> => {
  try {
    const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET as Secret) as RefreshTokenPayload;
    const revokedToken = await getRefreshToken(payload.jti);
    
    // Check if token is revoked (either success with revoked flag or error with TOKEN_REVOKED code)
    if (!revokedToken.success && revokedToken.error?.code === 'TOKEN_REVOKED') {
      return { valid: false, error: 'Token revoked' };
    }
    if (revokedToken.success && revokedToken.data?.revoked) {
      return { valid: false, error: 'Token revoked' };
    }
    
    return { valid: true, payload };
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
};

export const generateTokenPair = async (walletAddress: string): Promise<TokenPair> => {
  const access_token = await generateAccessToken(walletAddress);
  const refresh_token = await generateRefreshToken(walletAddress);
  return { access_token, refresh_token };
};

export const decodeToken = (token: string): DecodedToken | null => {
  try {
    return jwt.decode(token) as DecodedToken;
  } catch (error) {
    return null;
  }
};

export const tokenService: TokenService = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateTokenPair,
  decodeToken,
};
