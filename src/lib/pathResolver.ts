/**
 * Utility for resolving and validating paths with error handling.
 *
 * @module lib/pathResolver
 * @requires @/lib/logger
 */
import { logger } from './logger';

export async function resolvePath(path: string, description: string): Promise<string> {
  try {
    const response = await fetch(path, { method: 'HEAD', cache: 'no-store' });
    if (response.ok) {
      logger.info(`\x1b[32mPath verified: ${path} for ${description}\x1b[0m`);
      return path;
    }
    throw new Error(`HTTP error: ${response.status}`);
  } catch (error) {
    logger.warn(
      `\x1b[33mError checking path ${path} for ${description}: ${error.message}\x1b[0m`,
    );
    return path; // Return original path as fallback
  }
}