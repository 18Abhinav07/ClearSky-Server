import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

interface DatabaseConfig {
  uri: string;
  options?: mongoose.ConnectOptions;
}

const defaultConfig: DatabaseConfig = {
  uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/clearsky',
  options: {},
};

export const connectDB = async (config: DatabaseConfig = defaultConfig): Promise<typeof mongoose> => {
  try {
    await mongoose.connect(config.uri, config.options);
    return mongoose;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

mongoose.connection.on('connected', () => {
  console.log('MongoDB connected');
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
});

export default mongoose;
