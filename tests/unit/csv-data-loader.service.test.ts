import fs from 'fs';
import path from 'path';
import AQIReading from '@/models/AQIReading';
import { loadStationCSVData, summarizeLoaderResults } from '@/services/csv-data-loader.service';

describe('CSV Data Loader Service', () => {
  const testDataDir = path.join(__dirname, '../test-data');
  const testCSVPath = path.join(testDataDir, 'test-location.csv');

  beforeAll(async () => {
    // MongoDB connection already established in tests/setup.ts
    // Just create test data directory and CSV file
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }

    const csvContent = `"location_id","sensors_id","location","datetime","lat","lon","parameter","units","value"
11603,12236360,"Chandni Chowk, Delhi - IITM","2025-11-12T14:30:00+05:30","28.656756","77.227234","pm10","µg/m³","834.0"
11603,12236360,"Chandni Chowk, Delhi - IITM","2025-11-12T14:30:00+05:30","28.656756","77.227234","pm2.5","µg/m³","500.0"
11603,12236360,"Chandni Chowk, Delhi - IITM","2025-11-12T14:45:00+05:30","28.656756","77.227234","pm10","µg/m³","800.0"
11603,12236360,"Chandni Chowk, Delhi - IITM","2025-11-12T14:45:00+05:30","28.656756","77.227234","pm2.5","µg/m³","480.0"
11603,12236360,"Chandni Chowk, Delhi - IITM","2025-11-12T15:30:00+05:30","28.656756","77.227234","pm10","µg/m³","750.0"
11603,12236360,"Chandni Chowk, Delhi - IITM","2025-11-12T15:30:00+05:30","28.656756","77.227234","pm2.5","µg/m³","450.0"`;

    fs.writeFileSync(testCSVPath, csvContent);
  });

  afterAll(async () => {
    // Cleanup test data
    if (fs.existsSync(testCSVPath)) {
      fs.unlinkSync(testCSVPath);
    }
    if (fs.existsSync(testDataDir)) {
      fs.rmdirSync(testDataDir);
    }
  });

  beforeEach(async () => {
    await AQIReading.deleteMany({});
  });

  describe('loadStationCSVData', () => {
    it('should load CSV data and create hourly batches', async () => {
      const result = await loadStationCSVData(
        'delhi_chandni_chowk_iitm_11603',
        testCSVPath,
        false
      );

      expect(result.success).toBe(true);
      expect(result.total_rows).toBe(6);
      expect(result.batches_created).toBe(2); // Hour 14 and Hour 15
      expect(result.batches_updated).toBe(0);
      expect(result.errors.length).toBe(0);

      // Verify data in database
      const readings = await AQIReading.find({}).sort({ 'batch_window.start': 1 });
      expect(readings).toHaveLength(2);

      // Check first batch (hour 14)
      const batch1 = readings[0];
      expect(batch1.device_id).toBe('delhi_chandni_chowk_iitm_11603');
      expect(batch1.status).toBe('PENDING');
      expect(batch1.meta.ingestion_count).toBe(4); // 2 readings at 14:30, 2 at 14:45
      expect(batch1.sensor_data.PM10).toEqual([834.0, 800.0]);
      expect(batch1.sensor_data['PM2.5']).toEqual([500.0, 480.0]);

      // Check second batch (hour 15)
      const batch2 = readings[1];
      expect(batch2.meta.ingestion_count).toBe(2);
      expect(batch2.sensor_data.PM10).toEqual([750.0]);
      expect(batch2.sensor_data['PM2.5']).toEqual([450.0]);
    });

    it('should handle dry run mode', async () => {
      const result = await loadStationCSVData(
        'delhi_chandni_chowk_iitm_11603',
        testCSVPath,
        true
      );

      expect(result.success).toBe(true);
      expect(result.total_rows).toBe(6);
      expect(result.batches_created).toBe(2);

      // Verify nothing was written to database
      const count = await AQIReading.countDocuments();
      expect(count).toBe(0);
    });

    it('should handle invalid file path', async () => {
      const result = await loadStationCSVData(
        'delhi_chandni_chowk_iitm_11603',
        '/nonexistent/file.csv',
        false
      );

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('not found');
    });

    it('should handle invalid station ID', async () => {
      const result = await loadStationCSVData(
        'invalid_station',
        testCSVPath,
        false
      );

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('not found in configuration');
    });
  });

  describe('summarizeLoaderResults', () => {
    it('should correctly summarize loader results', () => {
      const results = [
        {
          success: true,
          station_id: 'station1',
          total_rows: 100,
          batches_created: 10,
          batches_updated: 0,
          errors: [],
          processing_time_ms: 50
        },
        {
          success: true,
          station_id: 'station1',
          total_rows: 150,
          batches_created: 12,
          batches_updated: 3,
          errors: ['Error 1', 'Error 2'],
          processing_time_ms: 75
        }
      ];

      const summary = summarizeLoaderResults(results);

      expect(summary.total_files).toBe(2);
      expect(summary.successful_files).toBe(2);
      expect(summary.total_rows).toBe(250);
      expect(summary.total_batches_created).toBe(22);
      expect(summary.total_batches_updated).toBe(3);
      expect(summary.total_errors).toBe(2);
      expect(summary.total_time_ms).toBe(125);
    });
  });
});
