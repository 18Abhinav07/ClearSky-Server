import { CityConfig, StationConfig, StationsConfig } from '@/types/device.types';
import sensorPresetConfig from '../../data/sensor_preset.json';

let config: StationsConfig = sensorPresetConfig as StationsConfig;

export interface ConfigService {
  loadStationsConfig(): StationsConfig;
  getAvailableCities(): CityConfig[];
  getStationsByCity(city_id: string): StationConfig[];
  getStationById(station_id: string): StationConfig | null;
  getAvailableSensors(station_id: string): string[];
  reloadConfig(): void;
}

export const loadStationsConfig = (): StationsConfig => {
  return config;
};

export const getAvailableCities = (): CityConfig[] => {
  return config.cities;
};

export const getStationsByCity = (city_id: string): StationConfig[] => {
  const city = config.cities.find(c => c.city_id === city_id);
  return city ? city.stations : [];
};

export const getStationById = (station_id: string): StationConfig | null => {
  for (const city of config.cities) {
    const station = city.stations.find(s => s.station_id === station_id);
    if (station) {
      return station;
    }
  }
  return null;
};

export const getAvailableSensors = (station_id: string): string[] => {
  const station = getStationById(station_id);
  return station ? station.available_sensors.map(s => s.sensor_type) : [];
};

export const reloadConfig = (): void => {
  // This is a simple implementation. In a real app, you might want to
  // re-read the file from disk. For now, we just re-assign it.
  config = sensorPresetConfig as StationsConfig;
};

export const configService: ConfigService = {
    loadStationsConfig,
    getAvailableCities,
    getStationsByCity,
    getStationById,
    getAvailableSensors,
    reloadConfig,
};
