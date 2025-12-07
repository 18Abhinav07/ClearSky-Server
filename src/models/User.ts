import { Schema, model, Document } from 'mongoose';

export interface IUser extends Document {
  walletAddress: string;
  devices: string[];
  assets: string[]; // Array of asset_ids owned by the user
  createdAt?: Date;
  updatedAt?: Date;
}

const userSchema = new Schema<IUser>({
  walletAddress: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    index: true,
    validate: {
      validator: (v: string) => /^0x[a-fA-F0-9]{40}$/.test(v),
      message: props => `${props.value} is not a valid wallet address!`,
    },
  },
  devices: {
    type: [String],
    default: [],
  },
  assets: {
    type: [String],
    default: [],
  },
}, {
  timestamps: true,
});

const User = model<IUser>('User', userSchema);

export default User;