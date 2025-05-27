/**
 * Server actions for background tasks.
 */
'use server';

import { logger } from '@/lib/logger';

export async function initBackgroundCache() {
  try {
    // Delay to simulate low priority
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/captions`, {
      cache: 'no-store',
    });
    if (!response.ok) {
      logger.warn(`Background cache initialization failed: ${response.status}`);
    }
    logger.info('Background cache initialized successfully');
  } catch (error) {
    logger.warn(`Background cache initialization error: ${error.message}`);
  }
}