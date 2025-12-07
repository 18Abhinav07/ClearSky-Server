import cron from 'node-cron';
import { logger } from '../utils/logger';
import * as DerivativeRepository from '../database/derivative.repository';
import * as llmService from '../services/llm.service';
import AQIReading from '../models/AQIReading';
import { Derivative } from '../models/Derivative';
import { IDerivative } from '../types/derivative.types';
import { LLM_CONFIG, CRON_CONFIG } from '../config/constants';
import moment from 'moment';

/**
 * Aggregates daily derivatives from the previous month into a single 'META' derivative.
 */
export async function processMetaDerivativeGeneration(): Promise<void> {
  const startTime = Date.now();
  logger.info('Starting META derivative generation job.');

  try {
    // 1. Determine the target month (previous month)
    const lastMonth = moment().subtract(1, 'month');
    const year = lastMonth.year();
    const month = lastMonth.month() + 1; // Moment months are 0-indexed

    logger.info(`Processing META derivative for ${year}-${month}`);

    // 2. Fetch all AQIReadings with status 'DERIVED_INDIVIDUAL' for the target month
    const startDate = lastMonth.startOf('month').toDate();
    const endDate = lastMonth.endOf('month').toDate();

    const individualReadings = await AQIReading.find({
      status: 'DERIVED_INDIVIDUAL',
      'batch_window.start': { $gte: startDate, $lte: endDate },
    }).lean();

    if (individualReadings.length === 0) {
      logger.info(`No DERIVED_INDIVIDUAL readings found for ${year}-${month}. Skipping META generation.`);
      return;
    }

    logger.debug(`[DERIVATIVE_META] Found individual readings`, {
      service: 'derivative-meta',
      year,
      month,
      count: individualReadings.length,
      date_range: { start: startDate, end: endDate },
      reading_ids: individualReadings.map(r => r.reading_id)
    });
    
    // 3. Get the corresponding derivative documents
    const derivativeIds = individualReadings.map(r => r.processing.derivative_id).filter(Boolean) as string[];
    const dailyDerivatives = await Derivative.find({ derivative_id: { $in: derivativeIds } }).lean();

    if (dailyDerivatives.length === 0) {
        logger.warn(`Found ${individualReadings.length} readings but 0 corresponding derivative documents.`);
        return;
    }

    logger.info(`Found ${dailyDerivatives.length} daily derivatives to aggregate.`);

    logger.debug(`[DERIVATIVE_META] Daily derivatives fetched`, {
      service: 'derivative-meta',
      count: dailyDerivatives.length,
      derivative_ids: dailyDerivatives.map(d => d.derivative_id),
      date_range: { start: startDate, end: endDate }
    });

    // 4. Prepare data for the monthly prompt
    const { dailySummariesJSON, worstDay, bestDay, overallStatus, location } = await prepareDataForMonthlyPrompt(dailyDerivatives);
    
    // 5. Load prompt templates
    // ... (rest of the logic is similar)
    const [systemInstructions, formattingRules, monthlyTemplate] = await Promise.all([
        llmService.loadPromptTemplate('system_instructions.md'),
        llmService.loadPromptTemplate('formatting_rules.md'),
        llmService.loadPromptTemplate('monthly_summary.template.md'),
    ]);

    // 6. Construct the final prompt
    let userPrompt = monthlyTemplate
        .replace('{{system_instructions}}', systemInstructions)
        .replace('{{formatting_rules}}', formattingRules)
        .replace('{{month_name}}', lastMonth.format('MMMM'))
        .replace('{{year}}', year.toString())
        .replace('{{location_name}}', location)
        .replace('{{monthly_status_emoji}}', overallStatus.emoji)
        .replace('{{monthly_status_text}}', overallStatus.text)
        .replace('{{worst_day_date}}', worstDay.date)
        .replace('{{worst_day_peak_pm10}}', worstDay.pm10.toFixed(2))
        .replace('{{best_day_date}}', bestDay.date)
        .replace('{{best_day_avg_pm10}}', bestDay.pm10.toFixed(2))
        .replace('{{daily_summaries_json}}', JSON.stringify(dailySummariesJSON, null, 2));


    // 7. Call the LLM with the powerful model
    logger.debug(`[DERIVATIVE_META] Calling LLM API`, {
      service: 'derivative-meta',
      model: LLM_CONFIG.MONTHLY_MODEL,
      temperature: LLM_CONFIG.TEMPERATURE_MONTHLY,
      max_tokens: LLM_CONFIG.MAX_TOKENS_MONTHLY,
      prompt_length: userPrompt.length,
      daily_derivatives_count: dailyDerivatives.length
    });

    const llmResult = await llmService.generateInference(
        systemInstructions,
        userPrompt,
        LLM_CONFIG.MONTHLY_MODEL,
        LLM_CONFIG.TEMPERATURE_MONTHLY,
        LLM_CONFIG.MAX_TOKENS_MONTHLY
    );

    logger.debug(`[DERIVATIVE_META] LLM response received`, {
      service: 'derivative-meta',
      model: llmResult.model,
      tokens_input: llmResult.tokensUsed.input,
      tokens_output: llmResult.tokensUsed.output,
      tokens_total: llmResult.tokensUsed.total,
      cost_usd: llmResult.costUSD,
      processing_time_ms: llmResult.processingTimeMs,
      content_length: llmResult.content.length,
      content_preview: llmResult.content.substring(0, 200) + '...'
    });

    // 8. Create the META derivative
    const childDerivativeIds = dailyDerivatives.map(d => d.derivative_id);
    const parentDataIds = [...new Set(dailyDerivatives.flatMap(d => d.parent_data_ids))];

    const metaDerivative = await DerivativeRepository.createDerivative({
        type: 'MONTHLY',
        content: llmResult.content,
        parent_data_ids: parentDataIds,
        child_derivative_ids: childDerivativeIds,
        llm_metadata: {
            provider: LLM_CONFIG.PROVIDER,
            model: llmResult.model,
            tokens_used: llmResult.tokensUsed,
            cost_usd: llmResult.costUSD,
            processing_time_ms: llmResult.processingTimeMs,
        },
        processing: { processed_at: new Date() }
    } as Partial<IDerivative>);

    logger.info(`Successfully created META derivative: ${metaDerivative.derivative_id}`);

    logger.debug(`[DERIVATIVE_META] META derivative created`, {
      service: 'derivative-meta',
      derivative_id: metaDerivative.derivative_id,
      derivative_type: 'MONTHLY',
      parent_data_ids_count: parentDataIds.length,
      child_derivative_ids_count: childDerivativeIds.length,
      content_hash: metaDerivative.processing?.content_hash,
      merkle_root: metaDerivative.processing?.merkle_root,
      ipfs_uri: metaDerivative.processing?.ipfs_uri,
      ipfs_hash: metaDerivative.processing?.ipfs_hash,
      ipfs_gateway_url: metaDerivative.processing?.ipfs_hash
        ? `https://gateway.pinata.cloud/ipfs/${metaDerivative.processing.ipfs_hash}`
        : null,
      llm_cost_usd: metaDerivative.llm_metadata?.cost_usd,
      mongodb_saved: true
    });

    // 9. Link all children to the new meta parent
    await DerivativeRepository.linkChildrenToMeta(childDerivativeIds, metaDerivative.derivative_id);
    logger.info(`Linked ${childDerivativeIds.length} children to META derivative.`);

    // 10. Update original raw data status to 'COMPLETE'
    const readingIdsToUpdate = individualReadings.map(r => (r as any)._id);
    await AQIReading.updateMany(
      { _id: { $in: readingIdsToUpdate } },
      { $set: { status: 'COMPLETE' } }
    );
    logger.info(`Updated ${readingIdsToUpdate.length} raw readings to COMPLETE.`);



  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error during META derivative generation';
    logger.error('META derivative generation job failed.', { error: errorMsg });
  } finally {
    const duration = Date.now() - startTime;
    logger.info('META derivative generation job finished.', { duration_ms: duration });
  }
}

/**
 * Prepares aggregated data from daily derivatives for the monthly summary prompt.
 */
async function prepareDataForMonthlyPrompt(dailyDerivatives: IDerivative[]) {
    logger.info('Preparing monthly summary data from daily derivatives');

    // Get location from the first derivative's parent readings
    let location = "Unknown Location";
    if (dailyDerivatives.length > 0 && dailyDerivatives[0].parent_data_ids.length > 0) {
        try {
            const firstReadingId = dailyDerivatives[0].parent_data_ids[0];
            const reading = await AQIReading.findOne({ reading_id: firstReadingId });
            if (reading) {
                location = reading.meta.location.station || reading.meta.location.city;
            }
        } catch (error) {
            logger.warn('Could not extract location from readings', { error });
        }
    }

    // Parse each daily derivative to extract PM10 data and summaries
    const dailySummariesJSON = [];
    let maxPm10 = -1;
    let minPm10 = Infinity;
    let worstDay = { date: '', pm10: 0 };
    let bestDay = { date: '', pm10: Infinity };

    for (const derivative of dailyDerivatives) {
        const content = derivative.content;
        const date = extractDateFromContent(content) || moment(derivative.created_at).format('YYYY-MM-DD');

        // Extract PM10 values from markdown tables
        const pm10Values = extractPM10Values(content);
        const dailyAvg = pm10Values.length > 0
            ? pm10Values.reduce((a, b) => a + b, 0) / pm10Values.length
            : 0;
        const peakPm10 = pm10Values.length > 0 ? Math.max(...pm10Values) : 0;

        // Extract peak time from content
        const peakTime = extractPeakTimeFromContent(content) || '00:00';

        // Extract first narrative/summary
        const summary = extractSummaryFromContent(content);

        dailySummariesJSON.push({
            date,
            summary,
            daily_avg_pm10: parseFloat(dailyAvg.toFixed(2)),
            peak_event_time: peakTime
        });

        // Track worst and best days
        if (peakPm10 > maxPm10) {
            maxPm10 = peakPm10;
            worstDay = { date, pm10: peakPm10 };
        }
        if (dailyAvg < minPm10 && dailyAvg > 0) {
            minPm10 = dailyAvg;
            bestDay = { date, pm10: dailyAvg };
        }
    }

    // Determine overall status based on average
    const allAvgs = dailySummariesJSON.map(d => d.daily_avg_pm10).filter(v => v > 0);
    const monthlyAvg = allAvgs.length > 0 ? allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length : 0;
    const overallStatus = getAQIStatus(monthlyAvg);

    logger.info('Monthly data preparation complete', {
        location,
        days_processed: dailySummariesJSON.length,
        monthly_avg: monthlyAvg.toFixed(2),
        worst_day: worstDay,
        best_day: bestDay
    });

    return { dailySummariesJSON, worstDay, bestDay, overallStatus, location };
}

/**
 * Extract date from daily log markdown (e.g., "# 📜 Daily Log: 02 Nov 2025")
 */
function extractDateFromContent(content: string): string | null {
    const dateMatch = content.match(/Daily Log:\s+(\d{2}\s+\w+\s+\d{4})/);
    if (dateMatch) {
        return moment(dateMatch[1], 'DD MMM YYYY').format('YYYY-MM-DD');
    }
    return null;
}

/**
 * Extract all PM10 values from markdown tables
 */
function extractPM10Values(content: string): number[] {
    const pm10Matches = content.matchAll(/\*\*PM10\*\*\s+\|\s+\*\*([0-9.]+)\*\*/g);
    const values: number[] = [];
    for (const match of pm10Matches) {
        const value = parseFloat(match[1]);
        if (!isNaN(value)) {
            values.push(value);
        }
    }
    return values;
}

/**
 * Extract peak time from content (looks for hour markers like "## 🕒 21:00")
 */
function extractPeakTimeFromContent(content: string): string | null {
    const pm10Values = extractPM10Values(content);
    if (pm10Values.length === 0) return null;

    const maxPm10 = Math.max(...pm10Values);
    const hourMatches = [...content.matchAll(/##\s+🕒\s+(\d{2}:\d{2})/g)];
    const pm10Lines = [...content.matchAll(/\*\*PM10\*\*\s+\|\s+\*\*([0-9.]+)\*\*/g)];

    for (let i = 0; i < pm10Lines.length; i++) {
        const value = parseFloat(pm10Lines[i][1]);
        if (value === maxPm10 && hourMatches[i]) {
            return hourMatches[i][1];
        }
    }

    return null;
}

/**
 * Extract first narrative/summary from content
 */
function extractSummaryFromContent(content: string): string {
    const narrativeMatch = content.match(/\*\*Narrative\*\*:\s+(.+?)(?=\n|$)/);
    if (narrativeMatch) {
        return narrativeMatch[1].trim().substring(0, 150) + '...';
    }

    // Fallback: extract first sentence from Smart Analysis
    const analysisMatch = content.match(/###\s+📉\s+Smart Analysis\s+\-\s+\*\*Narrative\*\*:\s+(.+?)(?=\n|$)/);
    if (analysisMatch) {
        return analysisMatch[1].trim().substring(0, 150) + '...';
    }

    return 'No summary available';
}

/**
 * Get AQI status and emoji based on PM10 value
 */
function getAQIStatus(pm10: number): { emoji: string; text: string } {
    if (pm10 >= 400) return { emoji: '🚨', text: 'CRITICAL' };
    if (pm10 >= 250) return { emoji: '🔴', text: 'VERY POOR' };
    if (pm10 >= 150) return { emoji: '🟠', text: 'POOR' };
    if (pm10 >= 100) return { emoji: '🟡', text: 'MODERATE' };
    if (pm10 >= 50) return { emoji: '🟢', text: 'SATISFACTORY' };
    return { emoji: '✅', text: 'GOOD' };
}


/**
 * Starts the META derivative generation cron job.
 * Schedule is configurable via CRON_DERIVATIVE_META env variable
 */
export function startMetaDerivativeJob(): void {
  const schedule = CRON_CONFIG.DERIVATIVE_META;

  cron.schedule(schedule, async () => {
    logger.info('META derivative generation cron job triggered.');
    logger.debug(`[DERIVATIVE_META] Cron triggered`, {
      service: 'derivative-meta',
      schedule,
      triggered_at: new Date().toISOString()
    });

    try {
      await processMetaDerivativeGeneration();
    } catch (error) {
      logger.error('META derivative generation cron job failed unexpectedly.', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  logger.info(`META derivative generation cron job scheduled: ${schedule}`);
}
