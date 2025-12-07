import { Schema, model, Document } from 'mongoose';

export interface IProcessedFile {
  file_path: string;
  station_id: string;
  device_id: string;
  processed_at: Date;
  batches_created: number;
  batches_updated: number;
  total_rows: number;
}

const processedFileSchema = new Schema<IProcessedFile & Document>({
  file_path: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  station_id: {
    type: String,
    required: true,
    index: true
  },
  device_id: {
    type: String,
    required: true
  },
  processed_at: {
    type: Date,
    required: true,
    default: Date.now
  },
  batches_created: {
    type: Number,
    default: 0
  },
  batches_updated: {
    type: Number,
    default: 0
  },
  total_rows: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
processedFileSchema.index({ station_id: 1, processed_at: -1 });
processedFileSchema.index({ device_id: 1, processed_at: -1 });

const ProcessedFile = model<IProcessedFile & Document>('ProcessedFile', processedFileSchema);

export default ProcessedFile;
