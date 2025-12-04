import { BatchWindow } from '@/types/aqi-reading.types';

export const getCurrentBatchWindow = (timestamp: Date = new Date()): BatchWindow => {
  const start = new Date(timestamp);
  start.setUTCMinutes(0, 0, 0);  // Set to start of hour in UTC

  const end = new Date(start);
  end.setUTCHours(end.getUTCHours() + 1);  // Add 1 hour in UTC

  const hour_index = start.getUTCHours();

  return { start, end, hour_index };
};

export const generateReadingId = (device_id: string, window: BatchWindow): string => {
  const dateStr = window.start.toISOString().split('T')[0].replace(/-/g, '');
  return `${device_id}_${dateStr}_H${String(window.hour_index).padStart(2, '0')}`;
};

export const isWithinCurrentWindow = (timestamp: Date): boolean => {
  const window = getCurrentBatchWindow();
  return timestamp >= window.start && timestamp < window.end;
};

export const getPastBatchWindows = (hours: number): BatchWindow[] => {
  const windows: BatchWindow[] = [];
  const now = new Date();

  for (let i = 0; i < hours; i++) {
    const time = new Date(now.getTime() - (i * 60 * 60 * 1000));
    windows.push(getCurrentBatchWindow(time));
  }

  return windows;
};

export const getDateFromBatchWindow = (window: BatchWindow): string => {
  return window.start.toISOString().split('T')[0];
};
