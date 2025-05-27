import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import PQueue from 'p-queue';
import { createLogger, format, transports } from 'winston';

// Logging setup
const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.printf(({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}] ${message}`)
  ),
  transports: [
    new transports.File({ filename: 'preview-frame.log' }),
    new transports.Console()
  ]
});

// FFmpeg queue to limit concurrency
const queue = new PQueue({ concurrency: 1 });

const VIDEO_DIR = process.env.VIDEO_DIR || './public/videos';
const CORS_ORIGIN = process.env.NEXT_PUBLIC_CORS_ORIGIN || 'http://10.0.0.75:3000';

async function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        logger.error(`FFprobe error for ${filePath}: ${err.message}`);
        resolve(0);
      } else {
        resolve(metadata.format.duration || 0);
      }
    });
  });
}

async function generateFrame(filePath: string, duration: number): Promise<Buffer> {
  const percentages = [0.1, 0.3, 0.5, 0.7, 0.9];
  const randomIndex = Math.floor(Math.random() * percentages.length);
  const timestamp = duration * percentages[randomIndex];

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    ffmpeg(filePath)
      .seekInput(timestamp)
      .frames(1)
      .videoFilters('scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2')
      .outputOptions('-q:v', '5')
      .format('mjpeg')
      .on('error', (err) => {
        logger.error(`FFmpeg error for ${filePath} at ${timestamp}s: ${err.message}`);
        reject(err);
      })
      .on('end', () => resolve(Buffer.concat(chunks)))
      .pipe()
      .on('data', (chunk) => chunks.push(chunk));
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const videoPath = url.searchParams.get('path');
    if (!videoPath) {
      logger.warn('Missing video path in request');
      return NextResponse.json({ error: 'Video path is required' }, { status: 400 });
    }

    const filePath = path.join(VIDEO_DIR, videoPath);
    try {
      await fs.access(filePath);
    } catch {
      logger.error(`Video not found: ${filePath}`);
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const duration = await queue.add(() => getVideoDuration(filePath));
    if (duration < 5) {
      logger.info(`Skipping ${videoPath}: Duration ${duration}s < 5s`);
      return NextResponse.json({ error: 'Video too short' }, { status: 400 });
    }

    const frameBuffer = await queue.add(() => generateFrame(filePath, duration));
    logger.info(`Generated frame for ${videoPath} at ${duration * [0.1, 0.3, 0.5, 0.7, 0.9][Math.floor(Math.random() * 5)]}s`);

    return new NextResponse(frameBuffer, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Access-Control-Allow-Origin': CORS_ORIGIN,
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    logger.error(`Error generating preview frame: ${error.message}`);
    return NextResponse.json({ error: 'Failed to generate preview frame' }, { status: 500 });
  }
}