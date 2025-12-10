import { Schema, model, Document } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface IUserDerivative extends Document {
  user_derivative_id: string;
  creator_wallet: string;
  parent_asset_id: string;
  parent_ip_id: string;
  child_ip_id: string;
  child_token_id: string;
  title: string;
  description: string;
  derivative_type: 'MODEL' | 'DATASET' | 'ANALYSIS' | 'VISUALIZATION' | 'REPORT' | 'APPLICATION' | 'CREATIVE' | 'OTHER';
  content_uri: string;
  ipfs_hash: string;
  price: number;
  creator_rev_share: number;
  is_listed: boolean;
  total_sales: number;
  total_revenue: number;
  license_terms_id: string;
  createdAt: Date;
  updatedAt: Date;
}

const userDerivativeSchema = new Schema<IUserDerivative>({
  user_derivative_id: {
    type: String,
    default: () => `uderiv_${uuidv4()}`,
    unique: true,
    required: true,
    index: true,
  },
  creator_wallet: {
    type: String,
    required: true,
    lowercase: true,
    index: true,
  },
  parent_asset_id: {
    type: String,
    required: true,
    index: true,
  },
  parent_ip_id: {
    type: String,
    required: true,
    index: true,
  },
  child_ip_id: {
    type: String,
    required: true,
    index: true,
  },
  child_token_id: {
    type: String,
    required: true,
    index: true,
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  derivative_type: {
    type: String,
    enum: ['MODEL', 'DATASET', 'ANALYSIS', 'VISUALIZATION', 'REPORT', 'APPLICATION', 'CREATIVE', 'OTHER'],
    required: true,
  },
  content_uri: {
    type: String,
    required: true,
  },
  ipfs_hash: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  creator_rev_share: {
    type: Number,
    default: 0,
  },
  is_listed: {
    type: Boolean,
    default: true,
    index: true,
  },
  total_sales: {
    type: Number,
    default: 0,
  },
  total_revenue: {
    type: Number,
    default: 0,
  },
  license_terms_id: {
    type: String,
    required: true,
  },
}, {
  timestamps: true,
  toJSON: {
    transform: (doc, ret: any) => {
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  },
});

const UserDerivative = model<IUserDerivative>('UserDerivative', userDerivativeSchema);

export default UserDerivative;
