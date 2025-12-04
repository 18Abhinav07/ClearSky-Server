import { Request, Response } from 'express';
import { authenticateUser, refreshAccessToken, logoutUser } from '@/services/auth.service';

export const login = async (req: Request, res: Response): Promise<void> => {
  const { wallet_address } = req.body;

  if (!wallet_address) {
    res.status(400).json({
      success: false,
      error: { message: 'wallet_address is required' },
    });
    return;
  }

  try {
    const loginData = await authenticateUser(wallet_address);
    res.status(200).json({
      success: true,
      data: loginData,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Server error' },
    });
  }
};

export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    res.status(400).json({
      success: false,
      error: { message: 'refresh_token is required' },
    });
    return;
  }

  try {
    const tokens = await refreshAccessToken(refresh_token);
    res.status(200).json({
      success: true,
      data: tokens,
    });
  } catch (error: any) {
    if (error.message === 'TOKEN_INVALID' || error.message === 'TOKEN_EXPIRED' || error.message === 'TOKEN_REVOKED') {
        res.status(401).json({
            success: false,
            error: { message: 'Invalid or expired refresh token' },
        });
        return;
    }
    console.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Server error' },
    });
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
    const walletAddress = req.user?.walletAddress;
    const access_token = req.headers.authorization?.replace('Bearer ', '');

    if (!walletAddress || !access_token) {
        res.status(401).json({
            success: false,
            error: { message: 'Unauthorized' },
        });
        return;
    }

    try {
        await logoutUser(walletAddress, access_token);
        res.status(200).json({
            success: true,
            message: 'Logged out successfully',
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Server error' },
        });
    }
};
