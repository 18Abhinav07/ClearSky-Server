import User, { IUser } from '@/models/User';

export interface UserRepository {
  findUserByWalletId(walletAddress: string): Promise<IUser | null>;
  createUser(walletAddress: string): Promise<IUser>;
  findOrCreateUser(walletAddress: string): Promise<IUser>;
}

export const findUserByWalletId = async (walletAddress: string): Promise<IUser | null> => {
  return User.findOne({ walletAddress: walletAddress.toLowerCase() }).lean();
};

export const createUser = async (walletAddress: string): Promise<IUser> => {
  return User.create({ walletAddress: walletAddress.toLowerCase(), devices: [] });
};

export const findOrCreateUser = async (walletAddress: string): Promise<IUser> => {
  try {
    const user = await findUserByWalletId(walletAddress);
    if (user) {
      return user;
    }
    return await createUser(walletAddress);
  } catch (error: any) {
    // Handle race condition where user is created between find and create
    if (error.code === 11000) {
      const user = await findUserByWalletId(walletAddress);
      if (user) {
        return user;
      }
    }
    throw error;
  }
};
