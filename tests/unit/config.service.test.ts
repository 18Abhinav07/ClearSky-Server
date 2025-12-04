import {
  loadStationsConfig,
  getAvailableCities,
  getStationsByCity,
  getStationById,
  getAvailableSensors,
} from '@/services/config.service';

describe('Config Service', () => {
  test('should load stations config', () => {
    const config = loadStationsConfig();
    expect(config.cities).toBeDefined();
    expect(config.cities.length).toBeGreaterThan(0);
  });

  test('should return available cities', () => {
    const cities = getAvailableCities();
    expect(Array.isArray(cities)).toBe(true);
  });

  test('should get stations by city', () => {
    const stations = getStationsByCity('delhi');
    expect(stations.length).toBeGreaterThan(0);
    expect(stations[0].station_id).toBeTruthy();
  });

  test('should return empty array for invalid city', () => {
    const stations = getStationsByCity('invalid_city');
    expect(stations).toEqual([]);
  });

  test('should get station by ID', () => {
    const station = getStationById('delhi_chandni_chowk_iitm_11603');
    expect(station).not.toBeNull();
    expect(station?.station_name).toBeTruthy();
  });

  test('should get available sensors for station', () => {
    const sensors = getAvailableSensors('delhi_chandni_chowk_iitm_11603');
    expect(Array.isArray(sensors)).toBe(true);
    expect(sensors.length).toBeGreaterThan(0);
  });
});
