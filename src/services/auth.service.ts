import { findOrCreateUser } from '@/database/user.repository';
import { generateTokenPair, verifyRefreshToken, decodeToken, verifyAccessToken } from './token.service';
import { storeAccessToken, storeRefreshToken, revokeRefreshToken } from '@/redis/token.repository';
import { createOrUpdateSession, getSession, clearUserSession } from '@/redis/session.repository';
import { addToBlacklist } from '@/redis/blacklist.repository';
import { LoginResponse, RefreshTokenResponse, TokenValidationResult } from '@/types/auth.types';
import { DEVICE_LIMIT } from '@/config/constants';
import { AccessTokenPayload, RefreshTokenPayload } from '@/types/token.types';

export interface AuthService {
  authenticateUser(wallet_address: string): Promise<LoginResponse>;
  refreshAccessToken(refresh_token: string): Promise<RefreshTokenResponse>;
  logoutUser(walletAddress: string, access_token: string): Promise<void>;
  validateSession(access_token: string): Promise<TokenValidationResult>;
}

export const authenticateUser = async (wallet_address: string): Promise<LoginResponse> => {
  const user = await findOrCreateUser(wallet_address);
  const limited = user.devices.length >= DEVICE_LIMIT;
  const tokens = await generateTokenPair(user.walletAddress);

  const accessTokenPayload = decodeToken(tokens.access_token) as AccessTokenPayload;
  const refreshTokenPayload = decodeToken(tokens.refresh_token) as RefreshTokenPayload;

  await storeAccessToken(accessTokenPayload.jti, {
    walletAddress: user.walletAddress,
    jti: accessTokenPayload.jti,
    issued_at: accessTokenPayload.iat,
    expires_at: accessTokenPayload.exp,
    device_count: user.devices.length,
  });

  await storeRefreshToken(refreshTokenPayload.jti, {
    walletAddress: user.walletAddress,
    jti: refreshTokenPayload.jti,
    token_family: refreshTokenPayload.token_family,
    issued_at: refreshTokenPayload.iat,
    expires_at: refreshTokenPayload.exp,
    revoked: false,
  });

  const session = await getSession(user.walletAddress);
  const newSession = {
    walletAddress: user.walletAddress,
    active_access_tokens: [...(session.data?.active_access_tokens || []), accessTokenPayload.jti],
    active_refresh_tokens: [...(session.data?.active_refresh_tokens || []), refreshTokenPayload.jti],
    device_count: user.devices.length,
    last_login: Date.now(),
    total_logins: (session.data?.total_logins || 0) + 1,
  };
  await createOrUpdateSession(user.walletAddress, newSession);

  return {
    walletAddress: user.walletAddress,
    devices: user.devices,
    limited,
    tokens,
  };
};

export const refreshAccessToken = async (refresh_token: string): Promise<RefreshTokenResponse> => {
  const validation = await verifyRefreshToken(refresh_token);
  if (!validation.valid || !validation.payload) {
    throw new Error('TOKEN_INVALID');
  }

  const { walletAddress, jti, token_family } = validation.payload as RefreshTokenPayload;
  await revokeRefreshToken(jti, 'refresh');

  const tokens = await generateTokenPair(walletAddress);
  const accessTokenPayload = decodeToken(tokens.access_token) as AccessTokenPayload;
  const refreshTokenPayload = decodeToken(tokens.refresh_token) as RefreshTokenPayload;

  const user = await findOrCreateUser(walletAddress);

  await storeAccessToken(accessTokenPayload.jti, {
    walletAddress,
    jti: accessTokenPayload.jti,
    issued_at: accessTokenPayload.iat,
    expires_at: accessTokenPayload.exp,
    device_count: user.devices.length,
  });

  await storeRefreshToken(refreshTokenPayload.jti, {
    walletAddress,
    jti: refreshTokenPayload.jti,
    token_family,
    issued_at: refreshTokenPayload.iat,
    expires_at: refreshTokenPayload.exp,
    parent_jti: jti,
    revoked: false,
  });
  
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  };
};

export const logoutUser = async (walletAddress: string, access_token: string): Promise<void> => {
  const session = await getSession(walletAddress);
  if (session.success && session.data) {
    const { active_access_tokens, active_refresh_tokens } = session.data;
    for (const jti of active_access_tokens) {
      await addToBlacklist(jti, { jti, walletAddress, revoked_at: Date.now(), reason: 'logout' });
    }
    for (const jti of active_refresh_tokens) {
      await revokeRefreshToken(jti, 'logout');
    }
    await clearUserSession(walletAddress);
  }
};

export const validateSession = async (access_token: string): Promise<TokenValidationResult> => {
  const validation = await verifyAccessToken(access_token);
  if (!validation.valid) {
    return validation;
  }
  return { valid: true, payload: validation.payload };
};
