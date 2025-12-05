import { IAQIReading } from '@/types/aqi-reading.types';
import { buildMerkleTree } from '@/utils/merkle.utils';
import { computeContentHash } from '@/utils/hash.utils';
import { pinJSONToIPFS } from '@/services/ipfs.service';
import { logger } from '@/utils/logger';

export interface VerificationResult {
  success: boolean;
  merkle_root?: string;
  content_hash?: string;
  ipfs_uri?: string;
  ipfs_hash?: string;
  error?: string;
  retry_count?: number;
}

/**
 * Build complete IPFS metadata payload from AQI reading
 */
export function buildIPFSMetadata(reading: IAQIReading, merkleRoot: string, contentHash: string): any {
  const sensorData: Record<string, any> = {};
  const dataPointsCount: Record<string, number> = {};

  // Convert sensor_data to structured format
  const sensorDataObj = reading.sensor_data as any;
  for (const [sensorType, values] of Object.entries(sensorDataObj)) {
    if (Array.isArray(values)) {
      sensorData[sensorType] = {
        values,
        unit: getSensorUnit(sensorType),
        sensor_type: sensorType
      };
      dataPointsCount[sensorType] = values.length;
    }
  }

  return {
    schema_version: '1.0',
    data_type: 'aqi_sensor_batch',

    batch_identity: {
      reading_id: reading.reading_id,
      device_id: reading.device_id,
      owner_wallet: reading.owner_id,
      batch_window: {
        start: reading.batch_window.start.toISOString(),
        end: reading.batch_window.end.toISOString(),
        hour_index: reading.batch_window.hour_index,
        timezone: 'UTC'
      }
    },

    location_metadata: {
      city: reading.meta.location?.city || 'Unknown',
      city_id: reading.meta.location?.city_id || 'unknown',
      station: reading.meta.location?.station || 'Unknown',
      station_id: reading.meta.location?.station_id || 'unknown',
      coordinates: reading.meta.location?.coordinates || null,
      country: 'India'
    },

    sensor_data: sensorData,

    statistics: {
      total_readings: Object.values(dataPointsCount).reduce((sum, count) => sum + count, 0),
      ingestion_count: reading.meta.ingestion_count,
      sensors_monitored: Object.keys(sensorData),
      data_points_per_sensor: dataPointsCount
    },

    cryptographic_proofs: {
      merkle_root: merkleRoot,
      merkle_tree_depth: calculateTreeDepth(Object.values(dataPointsCount).reduce((sum, count) => sum + count, 0)),
      merkle_leaf_count: Object.values(dataPointsCount).reduce((sum, count) => sum + count, 0),
      content_hash: contentHash,
      hash_algorithm: 'SHA-256'
    },

    timestamps: {
      first_ingestion: reading.created_at.toISOString(),
      last_ingestion: reading.meta.last_ingestion?.toISOString() || reading.updated_at.toISOString(),
      batch_closed: reading.batch_window.end.toISOString(),
      verified_at: new Date().toISOString()
    },

    provenance: {
      data_source: 'ClearSky IoT Device Network',
      verification_system: 'ClearSky Backend v1.0',
      license: 'CC BY 4.0',
      attribution: 'Data collected and verified by ClearSky'
    }
  };
}

/**
 * Get sensor unit for display
 */
function getSensorUnit(sensorType: string): string {
  const units: Record<string, string> = {
    'PM2.5': 'µg/m³',
    'PM10': 'µg/m³',
    'NO2': 'ppb',
    'NO': 'ppb',
    'NOX': 'ppb',
    'O3': 'ppb',
    'CO': 'ppm',
    'CO2': 'ppm',
    'SO2': 'ppb',
    'Temperature': '°C',
    'RH': '%',
    'Wind_Speed': 'm/s',
    'Wind_Direction': '°'
  };

  return units[sensorType] || 'unknown';
}

/**
 * Calculate tree depth for given number of leaves
 */
function calculateTreeDepth(leafCount: number): number {
  if (leafCount <= 1) return 0;
  return Math.ceil(Math.log2(leafCount));
}

/**
 * Verify an AQI reading batch and generate cryptographic proofs
 * @param reading - The AQI reading to verify
 * @returns Verification result with merkle root, content hash, and IPFS data
 */
export async function verifyAQIReading(reading: IAQIReading): Promise<VerificationResult> {
  try {
    logger.info(`Starting verification for reading: ${reading.reading_id}`);

    // Step 1: Generate Merkle tree and root
    const sensorDataObj = reading.sensor_data as any;
    const { root: merkleRoot } = buildMerkleTree(sensorDataObj);

    logger.info(`Generated Merkle root: ${merkleRoot.substring(0, 16)}...`);

    // Step 2: Build IPFS metadata
    const metadata = buildIPFSMetadata(reading, merkleRoot, '');

    // Step 3: Compute content hash of metadata
    const contentHash = computeContentHash(metadata);
    metadata.cryptographic_proofs.content_hash = contentHash;

    logger.info(`Computed content hash: ${contentHash.substring(0, 16)}...`);

    // Step 4: Pin to IPFS
    const { ipfsHash, ipfsUri } = await pinJSONToIPFS(metadata, {
      name: `clearsky-${reading.reading_id}`,
      keyvalues: {
        reading_id: reading.reading_id,
        device_id: reading.device_id,
        hour_index: reading.batch_window.hour_index
      }
    });

    logger.info(`Verification completed for ${reading.reading_id}`, {
      merkle_root: merkleRoot,
      ipfs_hash: ipfsHash
    });

    return {
      success: true,
      merkle_root: merkleRoot,
      content_hash: contentHash,
      ipfs_uri: ipfsUri,
      ipfs_hash: ipfsHash
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Verification failed for ${reading.reading_id}`, { error: errorMsg });

    return {
      success: false,
      error: errorMsg
    };
  }
}

/**
 * Verify multiple readings with rate limiting
 * @param readings - Array of readings to verify
 * @param maxConcurrent - Maximum concurrent verifications (default: 1 for sequential)
 * @returns Array of verification results
 */
export async function verifyMultipleReadings(
  readings: IAQIReading[],
  maxConcurrent: number = 1
): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];

  // Sequential processing (safe for IPFS rate limits)
  if (maxConcurrent === 1) {
    for (const reading of readings) {
      const result = await verifyAQIReading(reading);
      results.push(result);

      // Small delay between verifications to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return results;
  }

  // Parallel processing (future optimization)
  const chunks: IAQIReading[][] = [];
  for (let i = 0; i < readings.length; i += maxConcurrent) {
    chunks.push(readings.slice(i, i + maxConcurrent));
  }

  for (const chunk of chunks) {
    const chunkResults = await Promise.all(chunk.map(reading => verifyAQIReading(reading)));
    results.push(...chunkResults);
  }

  return results;
}
