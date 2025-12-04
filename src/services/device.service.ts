import mongoose from 'mongoose';
import Device, { IDevice } from '@/models/Device';
import { MAX_DEVICES_PER_PROVIDER } from '@/config/constants';

export const registerDevice = async (
  walletAddress: string,
  deviceId: string,
  location: string,
  sensor: string
): Promise<IDevice> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const deviceCount = await Device.countDocuments({
      owner: walletAddress,
    }).session(session);

    if (deviceCount >= MAX_DEVICES_PER_PROVIDER) {
      throw new Error('DEVICE_LIMIT_REACHED');
    }

    const [device] = await Device.create(
      [
        {
          deviceId,
          owner: walletAddress,
          location,
          sensor,
          status: 'active',
          registeredAt: new Date(),
        },
      ],
      { session }
    );

    await session.commitTransaction();
    return device;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};
