import { Schema, model, Document } from 'mongoose';
import { IAQIReading, ReadingStatus } from '@/types/aqi-reading.types';

const batchWindowSchema = new Schema({
  start: { type: Date, required: true },
  end: { type: Date, required: true },
  hour_index: { type: Number, required: true, min: 0, max: 23 }
}, { _id: false });

const locationMetaSchema = new Schema({
  city: { type: String, required: true },
  city_id: { type: String, required: true },
  station: { type: String, required: true },
  station_id: { type: String, required: true },
  coordinates: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true }
  }
}, { _id: false });

const metaSchema = new Schema({
  location: { type: locationMetaSchema, required: true },
  ingestion_count: { type: Number, default: 1 },
  last_ingestion: { type: Date, required: true },
  data_points_count: { type: Schema.Types.Mixed }
}, { _id: false });

const processingSchema = new Schema({
  picked_at: { type: Date },
  picked_by: { type: String },
  processed_at: { type: Date },
  merkle_root: { type: String },
  content_hash: { type: String },
  ipfs_uri: { type: String },
  ipfs_hash: { type: String },
  verified_at: { type: Date },
  ai_prep_started_at: { type: Date },
  derivative_id: { type: String }, // Links to the Derivative document
  ip_asset_id: { type: String },
  license_terms_id: { type: String },
  child_ip_asset_id: { type: String },
  error: { type: String },
  retry_count: { type: Number, default: 0 },
  failed_at: { type: Date }
}, { _id: false });

const aqiReadingSchema = new Schema<IAQIReading & Document>({
  reading_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  device_id: {
    type: String,
    required: true,
    ref: 'Device',
    index: true
  },
  owner_id: {
    type: String,
    required: true,
    ref: 'User',
    index: true
  },
  batch_window: {
    type: batchWindowSchema,
    required: true
  },
  sensor_data: {
    type: Schema.Types.Mixed,
    required: true
  },
  meta: {
    type: metaSchema,
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'PROCESSING', 'VERIFIED', 'DERIVING', 'DERIVED', 'MINTED', 'FAILED'],
    default: 'PENDING',
    index: true
  },
  processing: {
    type: processingSchema,
    default: {}
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'aqi_device_raw'
});

// Indexes for efficient queries
aqiReadingSchema.index({ device_id: 1, status: 1 });
aqiReadingSchema.index({ owner_id: 1, status: 1 });
aqiReadingSchema.index({ status: 1, 'batch_window.end': 1 });
aqiReadingSchema.index({ 'batch_window.start': 1, 'batch_window.end': 1 });

const AQIReading = model<IAQIReading & Document>('AQIReading', aqiReadingSchema);

export default AQIReading;
