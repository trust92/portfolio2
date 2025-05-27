/**
 * Fallback logger implementation with placeholders instead of glyphs.
 * Provides success, info, warn, and error methods with ANSI colors.
 */

const logger = {
  success: (message: string) => {
    console.log(`\x1b[32m Success: ${message}\x1b[0m`);
  },
  info: (message: string) => {
    console.log(`\x1b[36m Info: ${message}\x1b[0m`);
  },
  warn: (message: string) => {
    console.warn(`\x1b[33m Warning: ${message}\x1b[0m`);
  },
  error: (message: string) => {
    console.error(`\x1b[31m Error: ${message}\x1b[0m`);
  },
};

export { logger };