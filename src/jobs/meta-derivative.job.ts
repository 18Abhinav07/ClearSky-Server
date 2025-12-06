import cron from 'node-cron';
import { logger } from '../utils/logger';
import * as DerivativeRepository from '../database/derivative.repository';
import * as llmService from '../services/llm.service';
import AQIReading from '../models/AQIReading';
import { Derivative } from '../models/Derivative';
import { IDerivative } from '../types/derivative.types';
import { LLM_CONFIG } from '../config/constants';
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
    
    // 3. Get the corresponding derivative documents
    const derivativeIds = individualReadings.map(r => r.processing.derivative_id).filter(Boolean) as string[];
    const dailyDerivatives = await Derivative.find({ derivative_id: { $in: derivativeIds } }).lean();

    if (dailyDerivatives.length === 0) {
        logger.warn(`Found ${individualReadings.length} readings but 0 corresponding derivative documents.`);
        return;
    }

    logger.info(`Found ${dailyDerivatives.length} daily derivatives to aggregate.`);

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
    const llmResult = await llmService.generateInference(
        systemInstructions,
        userPrompt,
        LLM_CONFIG.MONTHLY_MODEL,
        LLM_CONFIG.TEMPERATURE_MONTHLY,
        LLM_CONFIG.MAX_TOKENS_MONTHLY
    );

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
    // This is a placeholder for the complex aggregation logic.
    // In a real scenario, you would parse the markdown of each daily derivative
    // to extract summaries, stats, etc.
    logger.warn('Monthly prompt data preparation is using placeholder logic.');
    
    const dailySummariesJSON = dailyDerivatives.map(d => ({
        date: moment(d.created_at).format('YYYY-MM-DD'),
        summary: `Summary for ${moment(d.created_at).format('YYYY-MM-DD')}`, // Placeholder
        daily_avg_pm10: 150, // Placeholder
        peak_event_time: '19:00' // Placeholder
    }));
    
    const location = "Unknown Location"; // Placeholder
    const worstDay = { date: '2025-11-15', pm10: 500 }; // Placeholder
    const bestDay = { date: '2025-11-05', pm10: 50 }; // Placeholder
    const overallStatus = { emoji: '🟠', text: 'VERY POOR' }; // Placeholder

    return { dailySummariesJSON, worstDay, bestDay, overallStatus, location };
}


/**
 * Starts the META derivative generation cron job.
 * Runs at 1 AM on the 1st day of every month.
 */
export function startMetaDerivativeJob(): void {
  cron.schedule('0 1 1 * *', async () => {
    logger.info('META derivative generation cron job triggered.');
    try {
      await processMetaDerivativeGeneration();
    } catch (error) {
      logger.error('META derivative generation cron job failed unexpectedly.', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  logger.info('META derivative generation cron job scheduled (1 AM on 1st of month).');
}
