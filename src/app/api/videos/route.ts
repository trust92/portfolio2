/**
 * API route for serving cached metadata for videos and images, with captions from a single text file.
 * Scans ./public/videos, ./public/images, and reads /public/captions/captions.txt for tags.
 * Uses a unified numeric ID index (1–100,000) based on creation date (newest first, images then videos).
 * Caches results in /cache/data.json, refreshes after 1 hour, on new files, or caption file changes.
 * Writes super file to /cache/captions-super.json for maintenance.
 * Supports filtering by type, tag, and video length. Pre-sorts by index.
 *
 * @module app/api/captions
 * @requires next/server
 * @requires fs/promises
 * @requires path
 * @requires @/lib/logger
 * @requires fluent-ffmpeg
 */
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '@/lib/logger';
import ffmpeg from 'fluent-ffmpeg';

interface Media {
  id: string; // Numeric index (1–100,000)
  type: 'video' | 'image';
  name: string;
  path: string;
  url?: string; // For videos
  fileType?: string; // For videos
  thumbnail?: string; // For videos
  preview?: string; // For videos
  duration?: number; // Seconds, for videos
  createdAt: string; // ISO datetime
  captions: string;
  tags: string[];
}

interface CacheData {
  media: Media[];
  timestamp: number;
  counts: number[];
  captionMtime: number;
}

interface Paths {
  VIDEO_DIR: string;
  IMAGE_DIR: string;
  CAPTION_FILE: string;
  CACHE_DIR: string;
  THUMBNAIL_DIR: string;
  NEXT_PUBLIC_CORS_ORIGIN: string;
}

// In-memory cache state
let cacheState: CacheData | null = null;

async function fetchConfig(): Promise<Paths> {
  return {
    VIDEO_DIR: './public/videos',
    IMAGE_DIR: './public/images',
    CAPTION_FILE: './public/captions/captions.txt',
    CACHE_DIR: './cache',
    THUMBNAIL_DIR: './public/thumbnails/preview',
    NEXT_PUBLIC_CORS_ORIGIN: '*',
  };
}

async function ensureDirectory(dir: string): Promise<void> {
  const fullPath = path.join(process.cwd(), dir);
  try {
    await fs.mkdir(fullPath, { recursive: true });
    logger.info(`Ensured directory exists: ${fullPath}`);
  } catch (error) {
    logger.error(`Failed to create directory ${fullPath}: ${error.message}`);
    throw error;
  }
}

async function readCaptionFile(captionFile: string): Promise<Map<string, { captions: string; tags: string[] }>> {
  const captionsMap = new Map<string, { captions: string; tags: string[] }>();
  try {
    const content = await fs.readFile(captionFile, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim());
    for (const line of lines) {
      const [id, ...tags] = line.split(',').map((item) => item.trim());
      if (!id || isNaN(Number(id))) {
        logger.warn(`Invalid ID in caption file: ${line}`);
        continue;
      }
      const validTags = tags.filter((tag) => tag); // Discard empty tags
      const captionText = validTags.length ? validTags.join(',') : '';
      captionsMap.set(id, { captions: captionText, tags: validTags });
    }
    logger.info(`Read ${captionsMap.size} captions from ${captionFile}`);
  } catch (error) {
    logger.warn(`Failed to read caption file ${captionFile}: ${error.message}`);
  }
  return captionsMap;
}

async function scanDirectory(dir: string, extensions: RegExp): Promise<{ path: string; ctime: Date }[]> {
  try {
    const files: { path: string; ctime: Date }[] = [];
    const entries = await fs.readdir(path.join(process.cwd(), dir), { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        files.push(...await scanDirectory(fullPath, extensions));
      } else if (entry.name.toLowerCase().match(extensions)) {
        const stats = await fs.stat(path.join(process.cwd(), fullPath));
        files.push({ path: fullPath, ctime: stats.birthtime });
      }
    }
    logger.info(`Scanned ${files.length} files in ${dir}`);
    return files;
  } catch (error) {
    logger.error(`Failed to scan directory ${dir}: ${error.message}`);
    return [];
  }
}

async function resolvePath(filePath: string, baseDir: string): Promise<string | null> {
  const fullPath = path.join(process.cwd(), baseDir, filePath);
  try {
    await fs.access(fullPath);
    logger.info(`Resolved path: ${fullPath}`);
    return fullPath;
  } catch (error) {
    logger.warn(`File not found: ${fullPath}: ${error.message}`);
    return null;
  }
}

async function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        logger.warn(`Failed to get duration for ${filePath}: ${err.message}`);
        resolve(10); // Fallback
      } else {
        resolve(metadata.format.duration || 10);
      }
    });
  });
}

async function countFiles(dir: string): Promise<number> {
  try {
    const entries = await fs.readdir(path.join(process.cwd(), dir), { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        count += await countFiles(fullPath);
      } else {
        count++;
      }
    }
    return count;
  } catch (error) {
    logger.warn(`Failed to count files in ${dir}: ${error.message}`);
    return 0;
  }
}

async function checkNewFiles(paths: Paths): Promise<boolean> {
  try {
    const cacheFile = path.join(process.cwd(), paths.CACHE_DIR, 'data.json');
    const stats = await fs.stat(cacheFile).catch(() => null);
    if (!stats) return true;

    const dirs = [paths.VIDEO_DIR, paths.IMAGE_DIR, paths.THUMBNAIL_DIR];
    const currentCounts = await Promise.all(dirs.map((dir) => countFiles(dir)));
    const captionFile = path.join(process.cwd(), paths.CAPTION_FILE);
    const captionStats = await fs.stat(captionFile).catch(() => null);
    const cachedCounts = cacheState?.counts || [];
    if (cachedCounts.length !== currentCounts.length) return true;

    const hasNewMedia = currentCounts.some((count, i) => count !== cachedCounts[i]);
    const hasNewCaptions = captionStats && cacheState?.captionMtime
      ? captionStats.mtimeMs > cacheState.captionMtime
      : true;

    if (hasNewCaptions) {
      // Delete cache to force refresh
      await fs.unlink(cacheFile).catch(() => null);
      logger.info('Caption file changed, deleted cache');
      return true;
    }

    return hasNewMedia;
  } catch (error) {
    logger.warn(`Failed to check new files: ${error.message}`);
    return true;
  }
}

async function initCache(): Promise<CacheData> {
  const cacheFile = path.join(process.cwd(), './cache/data.json');
  const superFile = path.join(process.cwd(), './cache/captions-super.json');
  const oneHourMs = 60 * 60 * 1000;

  // Check if cache is fresh
  if (cacheState) {
    const cacheAge = Date.now() - cacheState.timestamp;
    const hasNewFiles = await checkNewFiles(await fetchConfig());
    if (cacheAge < oneHourMs && !hasNewFiles) {
      logger.info('Returning fresh in-memory cache');
      return cacheState;
    }
  }

  // Try to read from cache file
  try {
    const cacheContent = await fs.readFile(cacheFile, 'utf-8');
    const parsedCache: CacheData = JSON.parse(cacheContent);
    const hasNewFiles = await checkNewFiles(await fetchConfig());
    if (Date.now() - parsedCache.timestamp < oneHourMs && !hasNewFiles) {
      cacheState = { ...parsedCache, counts: parsedCache.counts, captionMtime: parsedCache.captionMtime };
      logger.info('Returning fresh cache from file');
      return cacheState;
    }
  } catch (error) {
    logger.warn(`Cache file not found or invalid: ${error.message}`);
  }

  // Refresh cache
  try {
    const paths = await fetchConfig();
    await ensureDirectory(paths.CACHE_DIR);
    await ensureDirectory(path.dirname(paths.CAPTION_FILE));
    await ensureDirectory(paths.THUMBNAIL_DIR);

    const videoFiles = await scanDirectory(paths.VIDEO_DIR, /\.(mp4|webm)$/);
    const imageFiles = await scanDirectory(paths.IMAGE_DIR, /\.(jpg|jpeg|png|webp)$/);

    // Read captions
    const captionsMap = await readCaptionFile(path.join(process.cwd(), paths.CAPTION_FILE));
    const captionStats = await fs.stat(path.join(process.cwd(), paths.CAPTION_FILE)).catch(() => null);
    const captionMtime = captionStats ? captionStats.mtimeMs : 0;

    // Assign numeric IDs based on creation date (newest first, images then videos)
    const allFiles = [
      ...imageFiles.map((f) => ({ ...f, type: 'image' })),
      ...videoFiles.map((f) => ({ ...f, type: 'video' })),
    ].sort((a, b) => b.ctime.getTime() - a.ctime.getTime()); // Newest first

    const media: Media[] = await Promise.all(
      allFiles.map(async (file, index) => {
        const id = String(index + 1); // Index starts at 1
        const filename = path.basename(file.path, path.extname(file.path));
        const captionData = captionsMap.get(id) || { captions: '', tags: [] };
        const createdAt = file.ctime.toISOString();

        if (file.type === 'video') {
          const previewFileName = `${filename}.webm`;
          const previewPath = await resolvePath(previewFileName, paths.THUMBNAIL_DIR);
          const thumbPath = await resolvePath(`${filename}_thumb.jpg`, paths.THUMBNAIL_DIR);

          let thumbnail = `/thumbnails/preview/default.jpg`;
          let preview = `/thumbnails/preview/default.webm`;
          if (previewPath && thumbPath) {
            preview = `/thumbnails/preview/${previewFileName}`;
            thumbnail = `/thumbnails/preview/${filename}_thumb.jpg`;
            logger.info(`Thumbnail set for ${id}: ${thumbnail}`);
          }

          const duration = await getVideoDuration(path.join(process.cwd(), file.path));

          return {
            id,
            type: 'video',
            name: filename,
            path: `/videos/${filename}.${path.extname(file.path).slice(1).toLowerCase()}`,
            url: `/videos/${filename}.${path.extname(file.path).slice(1).toLowerCase()}`,
            fileType: path.extname(file.path).slice(1).toLowerCase(),
            thumbnail,
            preview,
            duration,
            createdAt,
            captions: captionData.captions,
            tags: captionData.tags,
          };
        } else {
          return {
            id,
            type: 'image',
            name: filename,
            path: `/images/${filename}.${path.extname(file.path).slice(1).toLowerCase()}`,
            createdAt,
            captions: captionData.captions,
            tags: captionData.tags,
          };
        }
      }),
    );

    // Create super file
    const superData = media.reduce((acc, item) => {
      acc[item.id] = item.captions;
      return acc;
    }, {} as Record<string, string>);

    // Count files
    const counts = await Promise.all([
      countFiles(paths.VIDEO_DIR),
      countFiles(paths.IMAGE_DIR),
      countFiles(paths.THUMBNAIL_DIR),
    ]);

    // Write cache and super file
    const newCache: CacheData = {
      media,
      timestamp: Date.now(),
      counts,
      captionMtime,
    };
    await fs.writeFile(cacheFile, JSON.stringify(newCache, null, 2));
    await fs.writeFile(superFile, JSON.stringify(superData, null, 2));
    logger.info(`Wrote cache to ${cacheFile} and super file to ${superFile}`);

    cacheState = newCache;
    return newCache;
  } catch (error) {
    logger.error(`Failed to initialize cache: ${error.message}`);
    cacheState = { media: [], timestamp: Date.now(), counts: [], captionMtime: 0 };
    return cacheState;
  }
}

// Initialize cache on server startup
initCache().catch((error) => {
  logger.error(`Cache initialization failed: ${error.message}`);
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // video, image
    const tag = searchParams.get('tag'); // Specific tag
    const length = searchParams.get('length'); // short, medium, long
    const { media } = await initCache();
    const paths = await fetchConfig();

    if (!media.length) {
      return NextResponse.json(
        { media: [], error: 'No media found' },
        { status: 404 },
      );
    }

    let filteredMedia = media;
    if (type) {
      filteredMedia = filteredMedia.filter((item) => item.type === type);
    }
    if (tag) {
      filteredMedia = filteredMedia.filter((item) =>
        item.tags.some((t) => t.toLowerCase().includes(tag.toLowerCase()))
      );
    }
    if (length && type === 'video') {
      filteredMedia = filteredMedia.filter((item) => {
        if (item.type !== 'video' || !item.duration) return false;
        if (length === 'short') return item.duration < 60;
        if (length === 'medium') return item.duration >= 60 && item.duration <= 300;
        if (length === 'long') return item.duration > 300;
        return true;
      });
    }

    return NextResponse.json({ media: filteredMedia }, {
      headers: {
        'Access-Control-Allow-Origin': paths.NEXT_PUBLIC_CORS_ORIGIN,
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    logger.error(`Internal server error: ${error.message}`);
    return NextResponse.json(
      { media: [], error: 'Internal server error', details: error.message },
      { status: 500 },
    );
  }
}