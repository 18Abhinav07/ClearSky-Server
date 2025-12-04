import { Schema, model, Document } from 'mongoose';

export interface IDevice extends Document {
  deviceId: string;
  owner: string;
  location: string;
  sensor: string;
  status: 'active' | 'inactive';
  registeredAt: Date;
  lastUpdated: Date;
}

const deviceSchema = new Schema<IDevice>({
  deviceId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  owner: {
    type: String,
    required: true,
    lowercase: true,
    index: true,
  },
  location: {
    type: String,
    required: true,
  },
  sensor: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
  registeredAt: {
    type: Date,
    default: Date.now,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: { createdAt: false, updatedAt: 'lastUpdated' }
});

deviceSchema.index({ owner: 1, location: 1, sensor: 1 });

const Device = model<IDevice>('Device', deviceSchema);

export default Device;
