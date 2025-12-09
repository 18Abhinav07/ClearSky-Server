import { Schema, model, Document } from 'mongoose';

export interface IAsset extends Document {
  asset_id: string;
  owner_wallet: string;
  derivative_id: string;
  primitive_data_ids: string[];
  ip_id: string;
  token_id: string;
  license_token_id: string;
  license_terms_id: string;
  access_type: 'ownership' | 'license';
  commercial_rev_share: number;
  purchase_price: number;
  purchase_tx_hash: string;
  royalty_paid_to_original_owner: number;
  platform_fee: number;
  purchased_at: Date;
  metadata: {
    derivative_type: 'DAILY' | 'MONTHLY';
    content_hash: string;
    ipfs_uri: string;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

const assetSchema = new Schema<IAsset>({
  asset_id: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  owner_wallet: {
    type: String,
    required: true,
    lowercase: true,
    index: true,
    validate: {
      validator: (v: string) => /^0x[a-fA-F0-9]{40}$/.test(v),
      message: props => `${props.value} is not a valid wallet address!`,
    },
  },
  derivative_id: {
    type: String,
    required: true,
    index: true,
  },
  primitive_data_ids: {
    type: [String],
    required: true,
  },
  ip_id: {
    type: String,
    required: true,
    index: true,
  },
  token_id: {
    type: String,
    required: true,
    index: true,
  },
  license_token_id: {
    type: String,
    index: true,
  },
  license_terms_id: {
    type: String,
    index: true,
  },
  access_type: {
    type: String,
    enum: ['ownership', 'license'],
    default: 'ownership',
  },
  commercial_rev_share: {
    type: Number,
  },
  purchase_price: {
    type: Number,
    required: true,
  },
  purchase_tx_hash: {
    type: String,
    required: true,
  },
  royalty_paid_to_original_owner: {
    type: Number,
    default: 0,
  },
  platform_fee: {
    type: Number,
    default: 0,
  },
  purchased_at: {
    type: Date,
    default: Date.now,
  },
  metadata: {
    derivative_type: {
      type: String,
      enum: ['DAILY', 'MONTHLY'],
      required: true,
    },
    content_hash: {
      type: String,
      required: true,
    },
    ipfs_uri: {
      type: String,
      required: true,
    },
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

const Asset = model<IAsset>('Asset', assetSchema);

export default Asset;
