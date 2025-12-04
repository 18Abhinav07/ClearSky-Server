/**
 * JWT Access Token Payload
 * Short-lived token for API authentication
 */
export interface AccessTokenPayload {
  walletAddress: string;           // User's wallet address (lowercase)
  token_type: 'access';        // Token type identifier
  jti: string;                 // JWT ID (unique token identifier)
  iat: number;                 // Issued at timestamp
  exp: number;                 // Expiration timestamp
}

/**
 * JWT Refresh Token Payload
 * Long-lived token for obtaining new access tokens
 */
export interface RefreshTokenPayload {
  walletAddress: string;           // User's wallet address (lowercase)
  token_type: 'refresh';       // Token type identifier
  jti: string;                 // JWT ID (unique token identifier)
  iat: number;                 // Issued at timestamp
  exp: number;                 // Expiration timestamp
  token_family: string;        // Family ID for rotation detection
}

/**
 * Token pair returned to client
 */
export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

/**
 * Decoded token (generic)
 */
export type DecodedToken = AccessTokenPayload | RefreshTokenPayload;
