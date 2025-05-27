import { NextResponse } from 'next/server';
import ffmpeg from 'fluent-ffmpeg';
import { logger } from '@/lib/logger';
import { promisify } from 'util';

// Promisify ffprobe to use async/await
const ffprobe = promisify(ffmpeg.ffprobe);

export async function POST(request: Request): Promise<Response> {
  try {
    const { filePath } = await request.json();
    if (!filePath) {
      logger.warn(`⚠ Missing filePath in request`);
      return NextResponse.json({ error: 'Missing filePath' }, { status: 400 });
    }

    try {
      const metadata = await ffprobe(filePath);
      const duration = metadata.format.duration || 10;
      logger.info(`ℹ Duration for ${filePath}: ${duration} seconds`);
      return NextResponse.json({ duration }, { status: 200 });
    } catch (err: any) {
      logger.warn(`⚠ Failed to get duration for ${filePath}: ${err.message}`);
      return NextResponse.json({ duration: 10 }, { status: 200 });
    }
  } catch (error: any) {
    logger.error(`✗ Error in FFmpeg API: ${error.message}`);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}