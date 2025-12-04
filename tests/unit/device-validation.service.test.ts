import { validateDeviceRegistration } from '@/services/device-validation.service';
import { DeviceRegistrationRequest } from '@/types/device.types';

describe('Device Validation Service', () => {
  test('should validate correct device registration', () => {
    const request: DeviceRegistrationRequest = {
      city_id: 'delhi',
      station_id: 'delhi_chandni_chowk_iitm_11603',
      sensor_types: ['CO', 'PM2.5']
    };

    const result = validateDeviceRegistration(request);
    expect(result.valid).toBe(true);
  });

  test('should reject invalid city', () => {
    const request: DeviceRegistrationRequest = {
      city_id: 'invalid_city',
      station_id: 'delhi_new_delhi_8118',
      sensor_types: ['CO2']
    };

    const result = validateDeviceRegistration(request);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('City');
  });

  test('should reject invalid station', () => {
    const request: DeviceRegistrationRequest = {
      city_id: 'delhi',
      station_id: 'invalid_station',
      sensor_types: ['CO']
    };

    const result = validateDeviceRegistration(request);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Station');
  });

  test('should reject sensors not available at station', () => {
    const request: DeviceRegistrationRequest = {
      city_id: 'delhi',
      station_id: 'delhi_new_delhi_8118', // Only has PM2.5
      sensor_types: ['CO', 'NO2'] // Not available at this station
    };

    const result = validateDeviceRegistration(request);
    expect(result.valid).toBe(false);
    expect(result.invalid_sensors).toContain('CO');
  });

  test('should accept sensor subset (degradation)', () => {
    const request: DeviceRegistrationRequest = {
      city_id: 'delhi',
      station_id: 'delhi_chandni_chowk_iitm_11603', // Has multiple sensors
      sensor_types: ['CO', 'NO2'] // Subset
    };

    const result = validateDeviceRegistration(request);
    expect(result.valid).toBe(true);
  });

  test('should reject empty sensor types', () => {
    const request: DeviceRegistrationRequest = {
      city_id: 'delhi',
      station_id: 'delhi_chandni_chowk_iitm_11603',
      sensor_types: []
    };

    const result = validateDeviceRegistration(request);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('At least one sensor type must be selected');
  });

  test('should reject duplicate sensor types', () => {
    const request: DeviceRegistrationRequest = {
      city_id: 'delhi',
      station_id: 'delhi_chandni_chowk_iitm_11603',
      sensor_types: ['CO', 'CO', 'PM2.5']
    };

    const result = validateDeviceRegistration(request);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Duplicate');
  });
});
