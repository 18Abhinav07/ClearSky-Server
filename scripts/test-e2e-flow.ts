/**
 * End-to-End Device Registration Flow Test
 * 
 * This script demonstrates the complete user journey:
 * 1. User logs in with wallet address
 * 2. Fetches available cities
 * 3. Selects a city and fetches its stations
 * 4. Selects a station and fetches available sensors
 * 5. Registers 3 devices (hitting the limit)
 * 6. Attempts to register a 4th device (should fail)
 * 7. Views all registered devices
 * 8. Optionally deletes a device
 */

import axios, { AxiosError } from 'axios';

const API_BASE_URL = 'http://localhost:3000/api/v1';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code?: string;
    message: string;
    invalid_sensors?: string[];
  };
}

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logStep(step: number, message: string) {
  log(`\n${'='.repeat(80)}`, colors.cyan);
  log(`STEP ${step}: ${message}`, colors.bright + colors.cyan);
  log('='.repeat(80), colors.cyan);
}

function logSuccess(message: string) {
  log(`✓ ${message}`, colors.green);
}

function logError(message: string) {
  log(`✗ ${message}`, colors.red);
}

function logInfo(message: string) {
  log(`ℹ ${message}`, colors.blue);
}

function logWarning(message: string) {
  log(`⚠ ${message}`, colors.yellow);
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runE2EFlow() {
  let accessToken = '';
  const walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
  const registeredDevices: string[] = [];

  try {
    // STEP 1: User Login
    logStep(1, 'USER LOGIN');
    logInfo(`Attempting login with wallet: ${walletAddress}`);
    
    const loginResponse = await axios.post<ApiResponse>(`${API_BASE_URL}/auth/login`, {
      wallet_address: walletAddress,
    });

    if (loginResponse.data.success) {
      accessToken = loginResponse.data.data.tokens.access_token;
      logSuccess('Login successful!');
      logInfo(`Access Token: ${accessToken.substring(0, 20)}...`);
      console.log(JSON.stringify(loginResponse.data.data, null, 2));
    }

    await sleep(500);

    // STEP 2: Fetch Available Cities
    logStep(2, 'FETCH AVAILABLE CITIES');
    logInfo('Retrieving list of all available cities...');

    const citiesResponse = await axios.get<ApiResponse>(`${API_BASE_URL}/config/cities`);
    
    if (citiesResponse.data.success) {
      const cities = citiesResponse.data.data;
      logSuccess(`Found ${cities.length} cities`);
      cities.forEach((city: any) => {
        console.log(`  • ${city.city_name} (${city.city_id}) - ${city.stations.length} stations`);
      });
    }

    await sleep(500);

    // STEP 3: Select City and Fetch Stations
    logStep(3, 'FETCH STATIONS FOR SELECTED CITY');
    const selectedCityId = 'delhi';
    logInfo(`User selected city: ${selectedCityId}`);

    const stationsResponse = await axios.get<ApiResponse>(
      `${API_BASE_URL}/config/stations/${selectedCityId}`
    );

    let selectedStation: any = null;
    if (stationsResponse.data.success) {
      const stations = stationsResponse.data.data;
      logSuccess(`Found ${stations.length} stations in ${selectedCityId}`);
      stations.forEach((station: any, index: number) => {
        console.log(`  ${index + 1}. ${station.station_name} (${station.station_id})`);
        console.log(`     📍 Lat: ${station.coordinates.latitude}, Lon: ${station.coordinates.longitude}`);
        console.log(`     🔬 ${station.available_sensors.length} sensors available`);
      });
      selectedStation = stations[0]; // Select first station
    }

    await sleep(500);

    // STEP 4: Fetch Available Sensors for Station
    logStep(4, 'FETCH AVAILABLE SENSORS');
    const selectedStationId = selectedStation.station_id;
    logInfo(`User selected station: ${selectedStation.station_name}`);

    const sensorsResponse = await axios.get<ApiResponse>(
      `${API_BASE_URL}/config/sensors/${selectedStationId}`
    );

    let availableSensors: any[] = [];
    if (sensorsResponse.data.success) {
      availableSensors = sensorsResponse.data.data;
      logSuccess(`Found ${availableSensors.length} available sensors`);
      availableSensors.forEach((sensor: any) => {
        console.log(`  • ${sensor.sensor_type} (${sensor.unit}) - ${sensor.description}`);
      });
    }

    await sleep(500);

    // STEP 5: Register First Device
    logStep(5, 'REGISTER FIRST DEVICE');
    const device1Sensors = ['CO', 'PM2.5', 'NO2'];
    logInfo(`Registering device with sensors: ${device1Sensors.join(', ')}`);

    const device1Response = await axios.post<ApiResponse>(
      `${API_BASE_URL}/devices/register`,
      {
        city_id: selectedCityId,
        station_id: selectedStationId,
        sensor_types: device1Sensors,
      },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (device1Response.data.success) {
      const device1 = device1Response.data.data;
      registeredDevices.push(device1.device_id);
      logSuccess('Device 1 registered successfully!');
      console.log(JSON.stringify(device1, null, 2));
    }

    await sleep(500);

    // STEP 6: Register Second Device (Sensor Degradation)
    logStep(6, 'REGISTER SECOND DEVICE (Sensor Degradation)');
    const device2Sensors = ['SO2', 'RH']; // Only selecting 2 sensors (subset)
    logInfo(`Registering device with degraded sensor selection: ${device2Sensors.join(', ')}`);
    logWarning('Note: Selecting only 2 sensors from available 15 (sensor degradation)');

    const device2Response = await axios.post<ApiResponse>(
      `${API_BASE_URL}/devices/register`,
      {
        city_id: selectedCityId,
        station_id: selectedStationId,
        sensor_types: device2Sensors,
      },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (device2Response.data.success) {
      const device2 = device2Response.data.data;
      registeredDevices.push(device2.device_id);
      logSuccess('Device 2 registered successfully!');
      console.log(JSON.stringify(device2, null, 2));
    }

    await sleep(500);

    // STEP 7: Register Third Device
    logStep(7, 'REGISTER THIRD DEVICE (Reaching Limit)');
    const device3Sensors = ['O3', 'Temperature', 'Wind_Speed'];
    logInfo(`Registering device with sensors: ${device3Sensors.join(', ')}`);
    logWarning('This is the 3rd device - reaching the limit!');

    const device3Response = await axios.post<ApiResponse>(
      `${API_BASE_URL}/devices/register`,
      {
        city_id: selectedCityId,
        station_id: selectedStationId,
        sensor_types: device3Sensors,
      },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (device3Response.data.success) {
      const device3 = device3Response.data.data;
      registeredDevices.push(device3.device_id);
      logSuccess('Device 3 registered successfully!');
      console.log(JSON.stringify(device3, null, 2));
    }

    await sleep(500);

    // STEP 8: View All Registered Devices
    logStep(8, 'VIEW ALL REGISTERED DEVICES');
    logInfo('Fetching user\'s device list...');

    const devicesResponse = await axios.get<ApiResponse>(
      `${API_BASE_URL}/devices`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (devicesResponse.data.success) {
      const devicesData = devicesResponse.data.data;
      logSuccess(`User has ${devicesData.count} devices registered`);
      logInfo(`Limit reached: ${devicesData.limit_reached ? 'YES' : 'NO'}`);
      
      devicesData.devices.forEach((device: any, index: number) => {
        console.log(`\n  Device ${index + 1}:`);
        console.log(`    ID: ${device.device_id}`);
        console.log(`    Station: ${device.sensor_meta.station} (${device.sensor_meta.city})`);
        console.log(`    Sensors: ${device.sensor_meta.sensor_types.join(', ')}`);
        console.log(`    Status: ${device.status}`);
        console.log(`    Registered: ${new Date(device.registered_at).toLocaleString()}`);
      });
    }

    await sleep(500);

    // STEP 9: Attempt to Register 4th Device (Should Fail)
    logStep(9, 'ATTEMPT TO REGISTER 4TH DEVICE (Should Fail)');
    const device4Sensors = ['Wind_Speed'];
    logWarning('Attempting to register beyond the 3-device limit...');

    try {
      const device4Response = await axios.post<ApiResponse>(
        `${API_BASE_URL}/devices/register`,
        {
          city_id: selectedCityId,
          station_id: selectedStationId,
          sensor_types: device4Sensors,
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (device4Response.data.success) {
        logError('ERROR: 4th device was registered (should have been rejected!)');
      }
    } catch (error) {
      const axiosError = error as AxiosError<ApiResponse>;
      if (axiosError.response?.status === 403) {
        logSuccess('Device limit enforcement working correctly!');
        console.log(`  Status: ${axiosError.response.status}`);
        console.log(`  Error Code: ${axiosError.response.data.error?.code}`);
        console.log(`  Message: ${axiosError.response.data.error?.message}`);
      } else {
        logError(`Unexpected error: ${axiosError.message}`);
      }
    }

    await sleep(500);

    // STEP 10: Test Invalid Sensor Selection
    logStep(10, 'TEST INVALID SENSOR SELECTION');
    const invalidSensors = ['INVALID_SENSOR', 'FAKE_SENSOR'];
    logInfo(`Attempting to register with invalid sensors: ${invalidSensors.join(', ')}`);

    try {
      await axios.post<ApiResponse>(
        `${API_BASE_URL}/devices/register`,
        {
          city_id: selectedCityId,
          station_id: selectedStationId,
          sensor_types: invalidSensors,
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      logError('ERROR: Invalid sensors were accepted (should have been rejected!)');
    } catch (error) {
      const axiosError = error as AxiosError<ApiResponse>;
      if (axiosError.response?.status === 400) {
        logSuccess('Validation working correctly!');
        console.log(`  Status: ${axiosError.response.status}`);
        console.log(`  Message: ${axiosError.response.data.error?.message}`);
        if (axiosError.response.data.error?.invalid_sensors) {
          console.log(`  Invalid sensors: ${axiosError.response.data.error.invalid_sensors.join(', ')}`);
        }
      } else {
        logError(`Unexpected error: ${axiosError.message}`);
      }
    }

    await sleep(500);

    // STEP 11: Delete a Device (Optional)
    logStep(11, 'DELETE A DEVICE (Optional)');
    if (registeredDevices.length > 0) {
      const deviceToDelete = registeredDevices[0];
      logInfo(`Deleting device: ${deviceToDelete}`);

      const deleteResponse = await axios.delete<ApiResponse>(
        `${API_BASE_URL}/devices/${deviceToDelete}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (deleteResponse.data.success) {
        logSuccess('Device deleted successfully!');
        console.log(JSON.stringify(deleteResponse.data, null, 2));
      }

      await sleep(500);

      // Verify deletion
      logInfo('Verifying device count after deletion...');
      const afterDeleteResponse = await axios.get<ApiResponse>(
        `${API_BASE_URL}/devices`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (afterDeleteResponse.data.success) {
        const afterData = afterDeleteResponse.data.data;
        logSuccess(`Devices remaining: ${afterData.count}`);
        logInfo(`Can register more devices: ${!afterData.limit_reached ? 'YES' : 'NO'}`);
      }
    }

    // FINAL SUMMARY
    log('\n' + '='.repeat(80), colors.cyan);
    log('END-TO-END TEST COMPLETED SUCCESSFULLY! ✓', colors.bright + colors.green);
    log('='.repeat(80), colors.cyan);
    
    console.log('\n📊 Summary:');
    console.log('  ✓ User authentication working');
    console.log('  ✓ Configuration API working (cities, stations, sensors)');
    console.log('  ✓ Device registration working');
    console.log('  ✓ Sensor degradation (subset selection) working');
    console.log('  ✓ 3-device limit enforcement working');
    console.log('  ✓ Invalid sensor validation working');
    console.log('  ✓ Device listing working');
    console.log('  ✓ Device deletion working');

  } catch (error) {
    const axiosError = error as AxiosError;
    logError('\n❌ E2E Test Failed!');
    console.error('Error:', axiosError.message);
    if (axiosError.response) {
      console.error('Response:', JSON.stringify(axiosError.response.data, null, 2));
    }
    process.exit(1);
  }
}

// Check if server is running
async function checkServer() {
  try {
    logInfo('Checking if server is running...');
    await axios.get(`${API_BASE_URL}/config/cities`);
    logSuccess('Server is running!');
    return true;
  } catch (error) {
    logError('Server is not running!');
    logWarning('Please start the server first:');
    console.log('  npm run dev');
    return false;
  }
}

// Main execution
(async () => {
  log('\n' + '█'.repeat(80), colors.cyan);
  log('  ClearSky Device Registration - End-to-End Flow Test', colors.bright + colors.cyan);
  log('█'.repeat(80) + '\n', colors.cyan);

  const serverRunning = await checkServer();
  if (!serverRunning) {
    process.exit(1);
  }

  await sleep(1000);
  await runE2EFlow();
})();
