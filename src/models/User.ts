import { Schema, model, Document } from 'mongoose';

export interface IUser extends Document {
  wallet_id: string;
  devices: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

const userSchema = new Schema<IUser>({
  wallet_id: {
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
}, {
  timestamps: true,
});

const User = model<IUser>('User', userSchema);

export default User;