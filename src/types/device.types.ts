// Configuration Types
export interface SensorInfo {
  sensor_type: string;        // e.g., "CO2", "PM2.5"
  unit: string;               // e.g., "ppm", "μg/m³"
  description: string;        // e.g., "Carbon Dioxide"
}

export interface StationConfig {
  station_id: string;         // e.g., "delhi_station_1"
  station_name: string;       // e.g., "Station 1 - Connaught Place"
  coordinates: {
    latitude: number;
    longitude: number;
  };
  available_sensors: SensorInfo[];
}

export interface CityConfig {
  city_id: string;            // e.g., "delhi"
  city_name: string;          // e.g., "New Delhi"
  country: string;            // e.g., "India"
  stations: StationConfig[];
}

export interface StationsConfig {
  version: string;
  last_updated: string;
  cities: CityConfig[];
}

// Device Registration Types
export interface DeviceRegistrationRequest {
  city_id: string;            // Selected city
  station_id: string;         // Selected station
  sensor_types: string[];     // Selected sensor types (subset of available)
}

export interface SensorMeta {
  city: string;               // City name
  city_id: string;            // City identifier
  station: string;            // Station name
  station_id: string;         // Station identifier
  coordinates: {
    latitude: number;
    longitude: number;
  };
  sensor_types: string[];     // Selected sensor types
}

export interface IDevice {
  device_id: string;          // UUID or signature-based ID
  owner_id: string;           // User wallet address (references User.walletAddress)
  sensor_meta: SensorMeta;    // Device configuration metadata
  status: 'active' | 'inactive';
  registered_at: Date;
  last_updated: Date;
}

// Validation Result
export interface ValidationResult {
  valid: boolean;
  error?: string;
  invalid_sensors?: string[]; // Sensors that don't exist at station
}

// Response Types
export interface DeviceRegistrationResponse {
  device_id: string;
  sensor_meta: SensorMeta;
  status: string;
  registered_at: Date;
}

export interface DeviceListResponse {
  devices: IDevice[];
  count: number;
  limit_reached: boolean;
}
