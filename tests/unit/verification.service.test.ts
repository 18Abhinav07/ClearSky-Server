import AQIReading from '@/models/AQIReading';
import { buildIPFSMetadata } from '@/services/verification.service';
import { IAQIReading } from '@/types/aqi-reading.types';

describe('Verification Service', () => {
  describe('buildIPFSMetadata', () => {
    it('should build complete IPFS metadata structure', () => {
      const mockReading: Partial<IAQIReading> = {
        reading_id: 'device-123_20241204_H15',
        device_id: 'device-123',
        owner_id: '0x1234567890abcdef',
        batch_window: {
          start: new Date('2024-12-04T15:00:00Z'),
          end: new Date('2024-12-04T16:00:00Z'),
          hour_index: 15
        },
        sensor_data: {
          'NO2': [10, 12, 15, 13],
          'PM2.5': [35, 38, 36, 37]
        },
        meta: {
          location: {
            city: 'New Delhi',
            city_id: 'delhi',
            station: 'Station 1',
            station_id: 'delhi_station_1',
            coordinates: { latitude: 28.6315, longitude: 77.2167 }
          },
          ingestion_count: 4,
          last_ingestion: new Date('2024-12-04T15:55:00Z'),
          data_points_count: { 'NO2': 4, 'PM2.5': 4 }
        },
        created_at: new Date('2024-12-04T15:10:00Z'),
        updated_at: new Date('2024-12-04T15:55:00Z')
      };

      const merkleRoot = 'a'.repeat(64);
      const contentHash = 'b'.repeat(64);

      const metadata = buildIPFSMetadata(mockReading as IAQIReading, merkleRoot, contentHash);

      expect(metadata.schema_version).toBe('1.0');
      expect(metadata.data_type).toBe('aqi_sensor_batch');
      expect(metadata.batch_identity.reading_id).toBe('device-123_20241204_H15');
      expect(metadata.batch_identity.device_id).toBe('device-123');
      expect(metadata.location_metadata.city).toBe('New Delhi');
      expect(metadata.sensor_data['NO2']).toBeDefined();
      expect(metadata.sensor_data['NO2'].values).toEqual([10, 12, 15, 13]);
      expect(metadata.sensor_data['PM2.5'].values).toEqual([35, 38, 36, 37]);
      expect(metadata.statistics.total_readings).toBe(8);
      expect(metadata.statistics.ingestion_count).toBe(4);
      expect(metadata.cryptographic_proofs.merkle_root).toBe(merkleRoot);
      expect(metadata.cryptographic_proofs.content_hash).toBe(contentHash);
      expect(metadata.provenance.data_source).toBe('ClearSky IoT Device Network');
    });

    it('should include sensor units in metadata', () => {
      const mockReading: Partial<IAQIReading> = {
        reading_id: 'test',
        device_id: 'test',
        owner_id: 'test',
        batch_window: {
          start: new Date(),
          end: new Date(),
          hour_index: 15
        },
        sensor_data: {
          'NO2': [10],
          'PM2.5': [35],
          'CO': [1.5]
        },
        meta: {
          location: {
            city: 'Test City',
            city_id: 'test',
            station: 'Test Station',
            station_id: 'test_station',
            coordinates: { latitude: 0, longitude: 0 }
          },
          ingestion_count: 1,
          last_ingestion: new Date(),
          data_points_count: {}
        },
        created_at: new Date(),
        updated_at: new Date()
      };

      const metadata = buildIPFSMetadata(mockReading as IAQIReading, 'root', 'hash');

      expect(metadata.sensor_data['NO2'].unit).toBe('ppb');
      expect(metadata.sensor_data['PM2.5'].unit).toBe('µg/m³');
      expect(metadata.sensor_data['CO'].unit).toBe('ppm');
    });

    it('should calculate correct statistics', () => {
      const mockReading: Partial<IAQIReading> = {
        reading_id: 'test',
        device_id: 'test',
        owner_id: 'test',
        batch_window: {
          start: new Date(),
          end: new Date(),
          hour_index: 15
        },
        sensor_data: {
          'NO2': [10, 12, 15],  // 3 readings
          'PM2.5': [35, 38]     // 2 readings
        },
        meta: {
          location: {
            city: 'Test City',
            city_id: 'test',
            station: 'Test Station',
            station_id: 'test_station',
            coordinates: { latitude: 0, longitude: 0 }
          },
          ingestion_count: 5,
          last_ingestion: new Date(),
          data_points_count: { 'NO2': 3, 'PM2.5': 2 }
        },
        created_at: new Date(),
        updated_at: new Date()
      };

      const metadata = buildIPFSMetadata(mockReading as IAQIReading, 'root', 'hash');

      expect(metadata.statistics.total_readings).toBe(5);
      expect(metadata.statistics.sensors_monitored).toEqual(['NO2', 'PM2.5']);
      expect(metadata.statistics.data_points_per_sensor['NO2']).toBe(3);
      expect(metadata.statistics.data_points_per_sensor['PM2.5']).toBe(2);
    });
  });
});
