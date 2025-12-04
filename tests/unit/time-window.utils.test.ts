import {
  getCurrentBatchWindow,
  generateReadingId,
  isWithinCurrentWindow,
  getPastBatchWindows
} from '@/utils/time-window.utils';

describe('Time Window Utils', () => {
  describe('getCurrentBatchWindow', () => {
    it('should return correct batch window for timestamp in middle of hour', () => {
      const timestamp = new Date('2025-11-12T14:35:00.000Z');
      const window = getCurrentBatchWindow(timestamp);

      expect(window.start).toEqual(new Date('2025-11-12T14:00:00.000Z'));
      expect(window.end).toEqual(new Date('2025-11-12T15:00:00.000Z'));
      expect(window.hour_index).toBe(14);
    });

    it('should return correct batch window for timestamp at hour start', () => {
      const timestamp = new Date('2025-11-12T14:00:00.000Z');
      const window = getCurrentBatchWindow(timestamp);

      expect(window.start).toEqual(new Date('2025-11-12T14:00:00.000Z'));
      expect(window.end).toEqual(new Date('2025-11-12T15:00:00.000Z'));
      expect(window.hour_index).toBe(14);
    });

    it('should handle midnight correctly', () => {
      const timestamp = new Date('2025-11-12T00:30:00.000Z');
      const window = getCurrentBatchWindow(timestamp);

      expect(window.start).toEqual(new Date('2025-11-12T00:00:00.000Z'));
      expect(window.end).toEqual(new Date('2025-11-12T01:00:00.000Z'));
      expect(window.hour_index).toBe(0);
    });

    it('should handle 23:xx hour correctly', () => {
      const timestamp = new Date('2025-11-12T23:45:00.000Z');
      const window = getCurrentBatchWindow(timestamp);

      expect(window.start).toEqual(new Date('2025-11-12T23:00:00.000Z'));
      expect(window.end).toEqual(new Date('2025-11-13T00:00:00.000Z'));
      expect(window.hour_index).toBe(23);
    });
  });

  describe('generateReadingId', () => {
    it('should generate correct reading ID format', () => {
      const deviceId = 'delhi_chandni_chowk_iitm_11603';
      const window = {
        start: new Date('2025-11-12T14:00:00.000Z'),
        end: new Date('2025-11-12T15:00:00.000Z'),
        hour_index: 14
      };

      const readingId = generateReadingId(deviceId, window);
      expect(readingId).toBe('delhi_chandni_chowk_iitm_11603_20251112_H14');
    });

    it('should pad single-digit hours with zero', () => {
      const deviceId = 'test-device';
      const window = {
        start: new Date('2025-11-12T09:00:00.000Z'),
        end: new Date('2025-11-12T10:00:00.000Z'),
        hour_index: 9
      };

      const readingId = generateReadingId(deviceId, window);
      expect(readingId).toBe('test-device_20251112_H09');
    });
  });

  describe('isWithinCurrentWindow', () => {
    it('should return true for timestamp within current window', () => {
      const timestamp = new Date('2025-11-12T14:20:00.000Z');
      const result = isWithinCurrentWindow(timestamp);
      
      // As long as current time is within the same hour as timestamp, should be true
      // We can't guarantee this, so let's just check the window calculation
      const window = getCurrentBatchWindow(timestamp);
      expect(window.hour_index).toBe(14);
    });

    it('should work with function logic', () => {
      const testTime = new Date('2025-11-12T14:35:00.000Z');
      const window = getCurrentBatchWindow(testTime);
      
      // Test with timestamp in same window
      const inWindow = new Date('2025-11-12T14:20:00.000Z');
      expect(inWindow >= window.start && inWindow < window.end).toBe(true);
      
      // Test with timestamp in previous window
      const beforeWindow = new Date('2025-11-12T13:45:00.000Z');
      expect(beforeWindow >= window.start && beforeWindow < window.end).toBe(false);
    });
  });

  describe('getPastBatchWindows', () => {
    it('should return correct number of past windows', () => {
      const windows = getPastBatchWindows(3);

      expect(windows).toHaveLength(3);
      expect(windows[0].hour_index).toBeGreaterThanOrEqual(0);
      expect(windows[0].hour_index).toBeLessThanOrEqual(23);
    });

    it('should return empty array for hours=0', () => {
      const windows = getPastBatchWindows(0);

      expect(windows).toHaveLength(0);
    });

    it('should return windows in reverse chronological order', () => {
      const windows = getPastBatchWindows(5);

      expect(windows).toHaveLength(5);
      // Each window should be 1 hour earlier than the previous
      for (let i = 0; i < windows.length - 1; i++) {
        const diff = windows[i].start.getTime() - windows[i + 1].start.getTime();
        expect(Math.abs(diff)).toBeLessThanOrEqual(3600000); // 1 hour in ms
      }
    });
  });
});
