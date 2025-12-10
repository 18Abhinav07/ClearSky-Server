import { Schema, model, Document } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface IUserDerivativeSale extends Document {
  sale_id: string;
  user_derivative_id: string;
  buyer_wallet: string;
  price: number;
  license_token_id: string;
  purchased_at: Date;
}

const userDerivativeSaleSchema = new Schema<IUserDerivativeSale>({
  sale_id: {
    type: String,
    default: () => `sale_${uuidv4()}`,
    unique: true,
    required: true,
    index: true,
  },
  user_derivative_id: {
    type: String,
    required: true,
    index: true,
  },
  buyer_wallet: {
    type: String,
    required: true,
    lowercase: true,
    index: true,
  },
  price: {
    type: Number,
    required: true,
  },
  license_token_id: {
    type: String,
    required: true,
  },
  purchased_at: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: false,
  toJSON: {
    transform: (doc, ret: any) => {
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  },
});

const UserDerivativeSale = model<IUserDerivativeSale>('UserDerivativeSale', userDerivativeSaleSchema);

export default UserDerivativeSale;
