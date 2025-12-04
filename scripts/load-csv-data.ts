#!/usr/bin/env ts-node
/**
 * CLI script to load historical CSV data into MongoDB
 * 
 * Usage:
 *   npm run load-data -- --station delhi_chandni_chowk_iitm_11603 --dir data/delhi_chandani_chowk_11603
 *   npm run load-data -- --station delhi_chandni_chowk_iitm_11603 --file data/delhi_chandani_chowk_11603/location-11603-20251112.csv
 *   npm run load-data -- --station delhi_chandni_chowk_iitm_11603 --dir data/delhi_chandani_chowk_11603 --dry-run
 */

import { connectDB } from '@/database/connection';
import { loadStationCSVData, loadStationDirectory, summarizeLoaderResults } from '@/services/csv-data-loader.service';
import { logger } from '@/utils/logger';
import mongoose from 'mongoose';
import path from 'path';

interface CLIArgs {
  station: string;
  file?: string;
  dir?: string;
  dryRun: boolean;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const parsed: CLIArgs = {
    station: '',
    dryRun: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--station':
        parsed.station = args[++i];
        break;
      case '--file':
        parsed.file = args[++i];
        break;
      case '--dir':
        parsed.dir = args[++i];
        break;
      case '--dry-run':
        parsed.dryRun = true;
        break;
    }
  }

  return parsed;
}

function printUsage() {
  console.log(`
Usage:
  npm run load-data -- --station <station_id> --file <csv_file> [--dry-run]
  npm run load-data -- --station <station_id> --dir <directory> [--dry-run]

Options:
  --station <id>    Station ID from sensor_preset.json (e.g., delhi_chandni_chowk_iitm_11603)
  --file <path>     Single CSV file to load
  --dir <path>      Directory containing CSV files to load
  --dry-run         Parse files without writing to database

Examples:
  # Load single file
  npm run load-data -- --station delhi_chandni_chowk_iitm_11603 --file data/delhi_chandani_chowk_11603/location-11603-20251112.csv

  # Load entire directory
  npm run load-data -- --station delhi_chandni_chowk_iitm_11603 --dir data/delhi_chandani_chowk_11603

  # Dry run to validate data
  npm run load-data -- --station delhi_chandni_chowk_iitm_11603 --dir data/delhi_chandani_chowk_11603 --dry-run
  `);
}

async function main() {
  try {
    const args = parseArgs();

    // Validate arguments
    if (!args.station) {
      console.error('Error: --station is required');
      printUsage();
      process.exit(1);
    }

    if (!args.file && !args.dir) {
      console.error('Error: Either --file or --dir must be specified');
      printUsage();
      process.exit(1);
    }

    if (args.file && args.dir) {
      console.error('Error: Cannot specify both --file and --dir');
      printUsage();
      process.exit(1);
    }

    // Connect to database (skip if dry run)
    if (!args.dryRun) {
      await connectDB();
      logger.info('✓ MongoDB connected');
    }

    logger.info('Starting CSV data loading', {
      station: args.station,
      file: args.file,
      dir: args.dir,
      dryRun: args.dryRun
    });

    // Load data
    if (args.file) {
      // Load single file
      const absolutePath = path.resolve(args.file);
      const result = await loadStationCSVData(args.station, absolutePath, args.dryRun);

      console.log('\n=== Loading Results ===');
      console.log(`Station: ${result.station_id}`);
      console.log(`Success: ${result.success}`);
      console.log(`Total Rows: ${result.total_rows}`);
      console.log(`Batches Created: ${result.batches_created}`);
      console.log(`Batches Updated: ${result.batches_updated}`);
      console.log(`Errors: ${result.errors.length}`);
      console.log(`Processing Time: ${result.processing_time_ms}ms`);

      if (result.errors.length > 0) {
        console.log('\nErrors:');
        result.errors.slice(0, 10).forEach(err => console.log(`  - ${err}`));
        if (result.errors.length > 10) {
          console.log(`  ... and ${result.errors.length - 10} more errors`);
        }
      }

    } else if (args.dir) {
      // Load directory
      const absolutePath = path.resolve(args.dir);
      const results = await loadStationDirectory(args.station, absolutePath, args.dryRun);
      const summary = summarizeLoaderResults(results);

      console.log('\n=== Loading Summary ===');
      console.log(`Station: ${args.station}`);
      console.log(`Total Files: ${summary.total_files}`);
      console.log(`Successful Files: ${summary.successful_files}`);
      console.log(`Total Rows: ${summary.total_rows.toLocaleString()}`);
      console.log(`Total Batches Created: ${summary.total_batches_created}`);
      console.log(`Total Batches Updated: ${summary.total_batches_updated}`);
      console.log(`Total Errors: ${summary.total_errors}`);
      console.log(`Total Processing Time: ${(summary.total_time_ms / 1000).toFixed(2)}s`);

      // Show per-file breakdown
      console.log('\n=== Per-File Results ===');
      results.forEach((result, idx) => {
        const status = result.success ? '✓' : '✗';
        console.log(`${status} File ${idx + 1}: ${result.total_rows} rows → ${result.batches_created} created, ${result.batches_updated} updated, ${result.errors.length} errors`);
      });

      // Show sample errors
      const allErrors = results.flatMap(r => r.errors);
      if (allErrors.length > 0) {
        console.log('\n=== Sample Errors ===');
        allErrors.slice(0, 5).forEach(err => console.log(`  - ${err}`));
        if (allErrors.length > 5) {
          console.log(`  ... and ${allErrors.length - 5} more errors`);
        }
      }
    }

    // Cleanup
    if (!args.dryRun) {
      await mongoose.disconnect();
      logger.info('✓ MongoDB disconnected');
    }

    console.log('\n✓ Data loading completed successfully');
    process.exit(0);

  } catch (error) {
    logger.error('Data loading failed', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    
    await mongoose.disconnect();
    process.exit(1);
  }
}

main();
