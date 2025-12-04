import User, { IUser } from '@/models/User';

export interface UserRepository {
  findUserByWalletId(wallet_id: string): Promise<IUser | null>;
  createUser(wallet_id: string): Promise<IUser>;
  findOrCreateUser(wallet_id: string): Promise<IUser>;
}

export const findUserByWalletId = async (wallet_id: string): Promise<IUser | null> => {
  return User.findOne({ wallet_id: wallet_id.toLowerCase() }).lean();
};

export const createUser = async (wallet_id: string): Promise<IUser> => {
  return User.create({ wallet_id: wallet_id.toLowerCase(), devices: [] });
};

export const findOrCreateUser = async (wallet_id: string): Promise<IUser> => {
  try {
    const user = await findUserByWalletId(wallet_id);
    if (user) {
      return user;
    }
    return await createUser(wallet_id);
  } catch (error: any) {
    // Handle race condition where user is created between find and create
    if (error.code === 11000) {
      const user = await findUserByWalletId(wallet_id);
      if (user) {
        return user;
      }
    }
    throw error;
  }
};
