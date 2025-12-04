import { Schema, model, Document } from 'mongoose';
import { IDevice, SensorMeta } from '@/types/device.types';

const sensorMetaSchema = new Schema<SensorMeta>({
  city: { type: String, required: true },
  city_id: { type: String, required: true },
  station: { type: String, required: true },
  station_id: { type: String, required: true },
  coordinates: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true }
  },
  sensor_types: [{ type: String, required: true }]
}, { _id: false });

const deviceSchema = new Schema<IDevice & Document>({
  device_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  owner_id: {
    type: String,
    required: true,
    ref: 'User',
    index: true
  },
  sensor_meta: {
    type: sensorMetaSchema,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  registered_at: {
    type: Date,
    default: Date.now
  },
  last_updated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
deviceSchema.index({ owner_id: 1, status: 1 });
deviceSchema.index({ 'sensor_meta.city_id': 1 });
deviceSchema.index({ 'sensor_meta.station_id': 1 });

const Device = model<IDevice & Document>('Device', deviceSchema);

export default Device;