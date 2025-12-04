/**
 * Access token metadata stored in Redis
 */
export interface RedisAccessTokenData {
  wallet_id: string;           // User identifier
  jti: string;                 // Token unique ID
  issued_at: number;           // Unix timestamp
  expires_at: number;          // Unix timestamp
  device_count: number;        // Snapshot of device count at token creation
  ip_address?: string;         // Optional: Client IP for security
}

/**
 * Refresh token metadata stored in Redis
 */
export interface RedisRefreshTokenData {
  wallet_id: string;           // User identifier
  jti: string;                 // Token unique ID
  token_family: string;        // Family ID for rotation tracking
  issued_at: number;           // Unix timestamp
  expires_at: number;          // Unix timestamp
  parent_jti?: string;         // Previous refresh token JTI (for rotation)
  revoked: boolean;            // Revocation status
  ip_address?: string;         // Optional: Client IP
  user_agent?: string;         // Optional: Browser/device info
}

/**
 * User session metadata (aggregate of all tokens)
 */
export interface RedisUserSession {
  wallet_id: string;           // User identifier
  active_access_tokens: string[];   // Array of active access token JTIs
  active_refresh_tokens: string[];  // Array of active refresh token JTIs
  device_count: number;        // Current device count
  last_login: number;          // Unix timestamp
  total_logins: number;        // Login counter
}

/**
 * Blacklisted/revoked token entry
 */
export interface RedisBlacklistedToken {
  jti: string;                 // Token JTI
  wallet_id: string;           // Owner
  revoked_at: number;          // Unix timestamp
  reason: 'logout' | 'refresh' | 'security' | 'expired';
}

/**
 * Redis operation result
 */
export interface RedisOperationResult<T = void> {
  success: boolean;
  data?: T;
  error?: RedisError;
}

/**
 * Redis error type
 */
export interface RedisError {
  code: string;
  message: string;
  details?: unknown;
}
