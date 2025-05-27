/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Utility for extracting EXIF metadata from video files using exiftool.
 *
 * @module lib/exifUtils
 * @requires exiftool-vendored
 * @requires @/lib/logger
 * @requires fs/promises
 */
import { ExifTool } from 'exiftool-vendored';
import { logger } from './logger';
import fs from 'fs/promises';

const exiftool = new ExifTool({
  taskTimeoutMillis: 120000, // 120s
  maxProcs: 1, // Single process to avoid BatchCluster issues
  maxTasksPerProcess: 50,
});

async function getExifMetadataWithRetry(filePath: string, retries = 2): Promise<Record<string, any>> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const stats = await fs.stat(filePath);
      if (stats.size === 0) {
        logger.warn(`\x1b[33mFile ${filePath} is empty\x1b[0m`);
        return { SourceFile: filePath, Error: 'Empty file' };
      }

      const metadata = await exiftool.read(filePath, [
        '-charset', 'filename=utf8',
        '-json',
        '-fast',
        '-api', 'struct=1',
        '-api', 'keepUTCTime',
        '-Duration#',
        '-GPSAltitude#',
        '-GPSLatitude#',
        '-GPSLongitude#',
        '-GPSPosition#',
        '-GeolocationPosition#',
        '-Orientation#',
        '-all',
        '-ignoreMinorErrors',
      ]);
      logger.info(`\x1b[32mSuccessfully extracted EXIF metadata for ${filePath} on attempt ${attempt}\x1b[0m`);
      return metadata;
    } catch (error) {
      logger.warn(`\x1b[33mAttempt ${attempt} failed for ${filePath}: ${error.message}\x1b[0m`);
      if (attempt === retries) {
        logger.error(`\x1b[31mFailed to extract EXIF metadata for ${filePath} after ${retries} attempts: ${error.message}\x1b[0m`);
        return { SourceFile: filePath, Error: 'Failed to extract metadata' };
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  return { SourceFile: filePath, Error: 'Unexpected failure after retries' };
}

export async function getExifMetadata(filePath: string): Promise<Record<string, any>> {
  try {
    const stats = await fs.stat(filePath);
    logger.info(`\x1b[36mProcessing EXIF for ${filePath} (size: ${stats.size} bytes)\x1b[0m`);
    if (!filePath.toLowerCase().match(/\.(mp4|webm)$/)) {
      logger.warn(`\x1b[33mUnsupported file type for ${filePath}\x1b[0m`);
      return { SourceFile: filePath, Error: 'Unsupported file type' };
    }
    return await getExifMetadataWithRetry(filePath);
  } catch (error) {
    logger.error(`\x1b[31mFailed to access ${filePath}: ${error.message}\x1b[0m`);
    return { SourceFile: filePath, Error: 'File inaccessible' };
  }
}

export async function cleanupExifTool() {
  try {
    await exiftool.end();
    logger.info(`\x1b[32mExifTool process ended successfully\x1b[0m`);
  } catch (error) {
    logger.error(`\x1b[31mFailed to end ExifTool process: ${error.message}\x1b[0m`);
  }
}