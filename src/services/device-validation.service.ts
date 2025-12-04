import { DeviceRegistrationRequest, ValidationResult } from '@/types/device.types';
import { loadStationsConfig } from './config.service';

export const validateDeviceRegistration = (
  request: DeviceRegistrationRequest
): ValidationResult => {
  const config = loadStationsConfig();

  // 1. Validate city exists
  const city = config.cities.find(c => c.city_id === request.city_id);
  if (!city) {
    return { valid: false, error: `City '${request.city_id}' not found` };
  }

  // 2. Validate station exists in city
  const station = city.stations.find(s => s.station_id === request.station_id);
  if (!station) {
    return { valid: false, error: `Station '${request.station_id}' not found in ${city.city_name}` };
  }

  // 3. Validate sensor types
  if (!request.sensor_types || request.sensor_types.length === 0) {
    return { valid: false, error: 'At least one sensor type must be selected' };
  }

  // 4. Check for duplicates
  const uniqueSensors = new Set(request.sensor_types);
  if (uniqueSensors.size !== request.sensor_types.length) {
    return { valid: false, error: 'Duplicate sensor types detected' };
  }

  // 5. Validate all selected sensors exist at station
  const availableSensors = station.available_sensors.map(s => s.sensor_type);
  const invalidSensors = request.sensor_types.filter(
    type => !availableSensors.includes(type)
  );

  if (invalidSensors.length > 0) {
    return {
      valid: false,
      error: `Invalid sensor types for this station`,
      invalid_sensors: invalidSensors
    };
  }

  return { valid: true };
};

export const getSensorDegradation = (station_id: string, selected: string[]): { valid: string[], invalid: string[] } => {
    const config = loadStationsConfig();
    const station = config.cities.flatMap(c => c.stations).find(s => s.station_id === station_id);
    if (!station) {
        return { valid: [], invalid: selected };
    }
    const available = station.available_sensors.map(s => s.sensor_type);
    const valid = selected.filter(s => available.includes(s));
    const invalid = selected.filter(s => !available.includes(s));
    return { valid, invalid };
};

export const validateSensorSubset = (available: string[], selected: string[]): boolean => {
    return selected.every(s => available.includes(s));
};
