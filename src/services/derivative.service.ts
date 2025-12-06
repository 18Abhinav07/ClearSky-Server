import { IAQIReading } from '../types/aqi-reading.types';
import * as DerivativeRepository from '../database/derivative.repository';
import * as ipfsService from './ipfs.service';
import * as llmService from './llm.service';
import { LLM_CONFIG } from '../config/constants';
import { buildMerkleTree } from '../utils/merkle.utils';
import { getDeterministicContentHash } from '../utils/hash.utils';
import { logger } from '../utils/logger';
import { Types } from 'mongoose';
import moment from 'moment';
import { IDerivative } from '@/types/derivative.types';

/**
 * Orchestrates the generation of AI-ready derivatives from verified AQI readings.
 * @param readings An array of AQIReading documents with status 'VERIFIED'.
 */
export const generateDerivatives = async (readings: IAQIReading[]): Promise<void> => {
  logger.info(`Starting derivative generation for ${readings.length} readings.`);
  if (readings.length === 0) {
    return;
  }

  const readingsByDay = groupReadingsByDay(readings);

  for (const [day, dayReadings] of readingsByDay.entries()) {
    try {
      // 1. Generate the daily report using the LLM
      const llmResult = await generateDailyReportWithLLM(day, dayReadings);

      // 2. Hash the LLM-generated content and pin to IPFS
      const ipfsData = await processAndPinContent(llmResult.content);

      // 3. Save the new derivative to the database
      const readingObjectIds = dayReadings.map(r => new Types.ObjectId((r as any)._id));

      await DerivativeRepository.createDerivative({
        type: 'DAILY',
        source_readings: readingObjectIds,
        parent_data_ids: readingObjectIds.map(id => id.toHexString()), // Per new schema
        content: llmResult.content,
        processing: {
          ...ipfsData,
          processed_at: new Date(),
        },
        llm_metadata: {
          provider: LLM_CONFIG.PROVIDER,
          model: llmResult.model,
          tokens_used: llmResult.tokensUsed,
          cost_usd: llmResult.costUSD,
          processing_time_ms: llmResult.processingTimeMs,
        }
      } as Partial<IDerivative>);

    } catch (error) {
      logger.error(`Failed to generate derivative for day ${day}:`, error);
      // TODO: Revert status of readings from 'DERIVING' back to 'VERIFIED'
    }
  }
};

/**
 * Generates a daily report by preparing data and calling the LLM service.
 * @param day The day for the report (YYYY-MM-DD).
 * @param readings The AQI readings for that day.
 * @returns The result from the LLM service.
 */
async function generateDailyReportWithLLM(day: string, readings: IAQIReading[]) {
  // 1. Prepare data for the prompt
  const { hourlyDataContext, dailyAvgPm10, peakPm10Hour } = prepareDataForPrompt(readings);

  // 2. Load prompt templates
  const [systemInstructions, formattingRules, dailyLogTemplate] = await Promise.all([
    llmService.loadPromptTemplate('system_instructions.md'),
    llmService.loadPromptTemplate('formatting_rules.md'),
    llmService.loadPromptTemplate('daily_log.template.md'),
  ]);
  
  // 3. Construct the final prompt
  let userPrompt = dailyLogTemplate
    .replace('{{system_instructions}}', systemInstructions)
    .replace('{{formatting_rules}}', formattingRules)
    .replace('{{date}}', moment(day).format('DD MMM YYYY'))
    .replace('{{location_name}}', readings[0]?.meta.location.station || 'Unknown')
    .replace('{{daily_avg_pm10}}', dailyAvgPm10.toFixed(2))
    .replace('{{peak_pm10_hour}}', peakPm10Hour.toString())
    .replace('{{hourly_data_json}}', JSON.stringify(hourlyDataContext, null, 2));

  // 4. Call the LLM to generate the content
  return llmService.generateInference(
    systemInstructions, // System prompt is implicitly part of the user prompt in this setup
    userPrompt,
    LLM_CONFIG.DAILY_MODEL,
    LLM_CONFIG.TEMPERATURE_DAILY,
    LLM_CONFIG.MAX_TOKENS_DAILY
  );
}

/**
 * Groups AQI readings by day (YYYY-MM-DD).
 */
const groupReadingsByDay = (readings: IAQIReading[]): Map<string, IAQIReading[]> => {
  const map = new Map<string, IAQIReading[]>();
  readings.forEach(reading => {
    const day = moment(reading.batch_window.start).format('YYYY-MM-DD');
    if (!map.has(day)) {
      map.set(day, []);
    }
    map.get(day)!.push(reading);
  });
  return map;
};

/**
 * Transforms raw readings into a structured format for the LLM prompt.
 */
function prepareDataForPrompt(readings: IAQIReading[]) {
  const hourlyData = new Map<number, { [param: string]: number }>();
  readings.forEach(r => {
    const hour = r.batch_window.hour_index;
    const values: { [param: string]: number } = {};
    for (const param in r.sensor_data) {
      const avgValue = r.sensor_data[param].reduce((a, b) => a + b, 0) / r.sensor_data[param].length;
      values[param] = parseFloat(avgValue.toFixed(3));
    }
    hourlyData.set(hour, values);
  });

  const dailyAvgPm10 = Array.from(hourlyData.values()).reduce((sum, v) => sum + (v['pm10'] || 0), 0) / hourlyData.size;

  let peakPm10Hour = -1;
  let maxPm10 = -1;
  hourlyData.forEach((values, hour) => {
    if (values['pm10'] > maxPm10) {
      maxPm10 = values['pm10'];
      peakPm10Hour = hour;
    }
  });

  const hourlyDataContext: any[] = [];
  const sortedHours = Array.from(hourlyData.keys()).sort((a, b) => a - b);
  let prevHourValues: { [param: string]: number } | undefined;

  for (const hour of sortedHours) {
    const values = hourlyData.get(hour)!;
    hourlyDataContext.push({
      hour,
      values,
      prev_hour_values: prevHourValues || null,
    });
    prevHourValues = values;
  }

  return { hourlyDataContext, dailyAvgPm10, peakPm10Hour };
}


/**
 * Hashes, builds a Merkle proof, and pins content to IPFS.
 */
const processAndPinContent = async (content: string) => {
  const contentHash = getDeterministicContentHash(content);
  // For a single piece of content, the Merkle root is simply its hash.
  const merkleRoot = contentHash;

  const ipfsData = await ipfsService.pinJSONToIPFS({
    name: `ClearSky-Derivative-${new Date().toISOString()}`,
    keyvalues: {
      content: content,
      contentHash: contentHash,
      merkleRoot: merkleRoot,
    }
  });

  return {
    content_hash: contentHash,
    merkle_root: merkleRoot,
    ipfs_uri: `ipfs://${ipfsData.ipfsHash}`,
    ipfs_hash: ipfsData.ipfsHash,
  };
};
