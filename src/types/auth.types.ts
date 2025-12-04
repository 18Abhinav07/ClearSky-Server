import { TokenPair } from './token.types';

/**
 * Login response data
 */
export interface LoginResponse {
  walletAddress: string;
  devices: string[];
  limited: boolean;
  tokens: TokenPair;
}

/**
 * Token refresh response
 */
export interface RefreshTokenResponse {
  access_token: string;
  refresh_token: string;  // New refresh token (rotation)
}

/**
 * Token validation result
 */
export interface TokenValidationResult {
  valid: boolean;
  payload?: any;
  error?: string;
}
