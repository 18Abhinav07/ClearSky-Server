export interface SensorDataPoint {
  [sensorType: string]: number[];  // e.g., "NO2": [10, 20, 40]
}

export interface BatchWindow {
  start: Date;
  end: Date;
  hour_index: number;               // 0-23 for hour of day
}

export interface ReadingMetadata {
  location: {
    city: string;
    city_id: string;
    station: string;
    station_id: string;
    coordinates: {
      latitude: number;
      longitude: number;
    };
  };
  ingestion_count: number;
  last_ingestion: Date;
  data_points_count: {
    [sensorType: string]: number;
  };
}

export interface ProcessingMetadata {
  picked_at?: Date;
  picked_by?: string;
  processed_at?: Date;
  merkle_root?: string;
  content_hash?: string;
  ipfs_uri?: string;
  ipfs_hash?: string;
  verified_at?: Date;
  ai_prep_started_at?: Date;
  derivative_id?: string;
  ip_asset_id?: string;
  license_terms_id?: string;
  child_ip_asset_id?: string;
  error?: string;
  retry_count?: number;
  failed_at?: Date;
}

export type ReadingStatus = 
  | 'PENDING'
  | 'PROCESSING'
  | 'VERIFIED'
  | 'PROCESSING_AI'
  | 'DERIVED_INDIVIDUAL'
  | 'COMPLETE'
  | 'MINTED'
  | 'FAILED';

export interface IAQIReading {
  reading_id: string;
  device_id: string;
  owner_id: string;
  batch_window: BatchWindow;
  sensor_data: SensorDataPoint;
  meta: ReadingMetadata;
  status: ReadingStatus;
  processing: ProcessingMetadata;
  created_at: Date;
  updated_at: Date;
}

// Ingestion Request from Client
export interface DataIngestionRequest {
  device_id: string;
  sensor_data: {
    [sensorType: string]: number;   // Single reading: { "NO2": 10, "PM2.5": 35 }
  };
  timestamp: number;                 // Unix timestamp
  signature?: string;                // Optional: Cryptographic signature
}

// Ingestion Response
export interface DataIngestionResponse {
  reading_id: string;
  device_id: string;
  status: ReadingStatus;
  batch_window: BatchWindow;
  ingestion_count: number;
  message: string;
}

// Cron Job Batch Result
export interface BatchProcessingResult {
  total_pending?: number;
  processed_count: number;
  failed_count: number;
  skipped_count: number;
  errors: Array<{ reading_id: string; error: string }>;
  processing_time_ms: number;
}

// Validation Result
export interface ValidationResult {
  valid: boolean;
  error?: string;
}
