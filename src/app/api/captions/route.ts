/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { logger } from '@/lib/logger';

interface Video {
  id: string;
  name: string;
  path: string;
  url: string;
  fileType: string;
  thumbnail: string;
  preview: string;
  duration: number;
  createdAt: string;
  captions: string;
  tags: string[];
}

interface Image {
  image: string;
  ctime: string;
  captions: string;
  tags: string[];
}

interface CacheData {
  videos: Video[];
  images: Image[];
  timestamp: number;
  counts: number[];
}

interface Paths {
  VIDEO_DIR: string;
  IMAGE_DIR: string;
  CAPTION_FILE: string;
  CACHE_DIR: string;
  THUMBNAIL_DIR: string;
  NEXT_PUBLIC_CORS_ORIGIN: string;
}

let cacheState: CacheData | null = null;

async function fetchConfig(): Promise<Paths> {
  return {
    VIDEO_DIR: './public/videos',
    IMAGE_DIR: './public/images',
    CAPTION_FILE: './public/captions.txt',
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

async function readCaptionsFile(): Promise<Map<string, { captions: string; tags: string[] }>> {
  const captionPath = path.join(process.cwd(), './public/captions.txt');
  const captionsMap = new Map<string, { captions: string; tags: string[] }>();
  try {
    const captionContent = await fs.readFile(captionPath, 'utf-8');
    const lines = captionContent.split('\n').filter((line) => line.trim());
    for (const line of lines) {
      const [id, content] = line.split(':', 2).map((part) => part.trim());
      if (!id || !content) continue;
      const tags = content
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag);
      captionsMap.set(id, { captions: content, tags });
    }
    logger.info(`Read ${captionsMap.size} captions from ${captionPath}`);
    return captionsMap;
  } catch (error) {
    logger.warn(`Failed to read captions file ${captionPath}: ${error.message}`);
    return captionsMap;
  }
}

async function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        logger.warn(`Failed to get duration for ${filePath}: ${err.message}`);
        resolve(10); // Fallback duration
      } else {
        const duration = metadata.format.duration || 10;
        logger.info(`Duration for ${filePath}: ${duration} seconds`);
        resolve(Math.round(duration));
      }
    });
  });
}

async function scanDirectory(dir: string, extensions: RegExp): Promise<string[]> {
  try {
    const files: string[] = [];
    const entries = await fs.readdir(path.join(process.cwd(), dir), { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        files.push(...await scanDirectory(fullPath, extensions));
      } else if (entry.name.toLowerCase().match(extensions)) {
        files.push(fullPath);
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
    const captionStats = await fs.stat(path.join(process.cwd(), paths.CAPTION_FILE)).catch(() => null);
    currentCounts.push(captionStats ? 1 : 0);
    const cachedCounts = cacheState?.counts || [];
    if (cachedCounts.length !== currentCounts.length) return true;

    return currentCounts.some((count, i) => count !== cachedCounts[i]);
  } catch (error) {
    logger.warn(`Failed to check new files: ${error.message}`);
    return true;
  }
}

async function initCache(): Promise<CacheData> {
  const cacheFile = path.join(process.cwd(), './cache/data.json');
  const superFile = path.join(process.cwd(), './cache/captions-super.json');
  const oneHourMs = 60 * 60 * 1000;

  if (cacheState) {
    const cacheAge = Date.now() - cacheState.timestamp;
    const hasNewFiles = await checkNewFiles(await fetchConfig());
    if (cacheAge < oneHourMs && !hasNewFiles) {
      logger.info('Returning fresh in-memory cache');
      return cacheState;
    }
  }

  try {
    const cacheContent = await fs.readFile(cacheFile, 'utf-8');
    const parsedCache: CacheData = JSON.parse(cacheContent);
    const hasNewFiles = await checkNewFiles(await fetchConfig());
    if (Date.now() - parsedCache.timestamp < oneHourMs && !hasNewFiles) {
      cacheState = { ...parsedCache, counts: parsedCache.counts };
      logger.info('Returning fresh cache from file');
      return cacheState;
    }
  } catch (error) {
    logger.warn(`Cache file not found or invalid: ${error.message}`);
  }

  try {
    const paths = await fetchConfig();
    await ensureDirectory(paths.CACHE_DIR);
    await ensureDirectory(paths.THUMBNAIL_DIR);

    const captionsMap = await readCaptionsFile();
    const videoFiles = await scanDirectory(paths.VIDEO_DIR, /\.(mp4|webm)$/);
    const imageFiles = await scanDirectory(paths.IMAGE_DIR, /\.(jpg|jpeg|png)$/);

    const videos: Video[] = await Promise.all(
      videoFiles.map(async (relativePath) => {
        const id = path.basename(relativePath, path.extname(relativePath));
        const previewFileName = `${id}.webm`;
        const previewPath = await resolvePath(previewFileName, paths.THUMBNAIL_DIR);
        const thumbPath = await resolvePath(`${id}_thumb.jpg`, paths.THUMBNAIL_DIR);

        let thumbnail = `/thumbnails/preview/default.jpg`;
        let preview = `/thumbnails/preview/default.webm`;
        if (previewPath && thumbPath) {
          preview = `/thumbnails/preview/${previewFileName}`;
          thumbnail = `/thumbnails/preview/${id}_thumb.jpg`;
          logger.info(`Thumbnail set for ${id}: ${thumbnail}`);
          logger.info(`WebM preview set for ${id}: ${preview}`);
        } else {
          logger.warn(`No WebM preview or thumbnail found for ${id}, using default`);
        }

        let duration = 10;
        try {
          const fullVideoPath = path.join(process.cwd(), relativePath);
          duration = await getVideoDuration(fullVideoPath);
        } catch (error) {
          logger.warn(`Failed to get duration for ${relativePath}: ${error.message}`);
        }

        let createdAt = new Date().toISOString();
        try {
          const stats = await fs.stat(path.join(process.cwd(), relativePath));
          createdAt = stats.birthtime.toISOString();
        } catch (error) {
          logger.warn(`Failed to get stats for ${relativePath}: ${error.message}`);
        }

        const { captions = '', tags = [] } = captionsMap.get(id) || {};

        return {
          id,
          name: id,
          path: `/videos/${id}.${path.extname(relativePath).slice(1).toLowerCase()}`,
          url: `/videos/${id}.${path.extname(relativePath).slice(1).toLowerCase()}`,
          fileType: path.extname(relativePath).slice(1).toLowerCase(),
          thumbnail,
          preview,
          duration,
          createdAt,
          captions,
          tags,
        };
      }),
    );

    const images: Image[] = await Promise.all(
      imageFiles.map(async (relativePath) => {
        const id = path.basename(relativePath, path.extname(relativePath));
        let ctime = new Date().toISOString();
        try {
          const stats = await fs.stat(path.join(process.cwd(), relativePath));
          ctime = stats.birthtime.toISOString();
        } catch (error) {
          logger.warn(`Failed to get stats for ${relativePath}: ${error.message}`);
        }

        const { captions = '', tags = [] } = captionsMap.get(id) || {};

        return {
          image: `/images/${id}.${path.extname(relativePath).slice(1).toLowerCase()}`,
          ctime,
          captions,
          tags,
        };
      }),
    );

    const superData = [...videos, ...images].reduce((acc, item) => {
      acc[item.id] = item.captions;
      return acc;
    }, {} as Record<string, string>);

    const counts = await Promise.all([
      countFiles(paths.VIDEO_DIR),
      countFiles(paths.IMAGE_DIR),
      countFiles(paths.THUMBNAIL_DIR),
    ]);
    const captionStats = await fs.stat(path.join(process.cwd(), paths.CAPTION_FILE)).catch(() => null);
    counts.push(captionStats ? 1 : 0);

    const newCache: CacheData = {
      videos,
      images,
      timestamp: Date.now(),
      counts,
    };
    await fs.writeFile(cacheFile, JSON.stringify(newCache, null, 2));
    await fs.writeFile(superFile, JSON.stringify(superData, null, 2));
    logger.info(`Wrote cache to ${cacheFile} and super file to ${superFile}`);

    cacheState = newCache;
    return newCache;
  } catch (error) {
    logger.error(`Failed to initialize cache: ${error.message}`);
    cacheState = { videos: [], images: [], timestamp: Date.now(), counts: [] };
    return cacheState;
  }
}

initCache().catch((error) => {
  logger.error(`Cache initialization failed: ${error.message}`);
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const id = searchParams.get('id');
    const { videos, images } = await initCache();
    const paths = await fetchConfig();

    if (!videos.length && !images.length) {
      return NextResponse.json(
        { videos: [], images: [], error: 'No media found' },
        { status: 404 },
      );
    }

    let response: any;

    if (type === 'video' && id) {
      // Handle ?type=video&id=vid_01
      const video = videos.find((v) => v.id === id);
      if (!video) {
        logger.warn(` Warning: Video not found for id: ${id}`);
        return NextResponse.json(
          { error: 'Video not found' },
          { status: 404 },
        );
      }
      response = video; // Return single video object
      logger.info(` Info: Returned video ${id}: ${video.id}`);
    } else if (type === 'video') {
      // Handle ?type=video
      response = videos; // Return all videos as array
    } else if (type === 'image') {
      response = { images };
    } else {
      response = { videos, images };
    }

    return NextResponse.json(response, {
      headers: {
        'Access-Control-Allow-Origin': paths.NEXT_PUBLIC_CORS_ORIGIN,
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error: any) {
    logger.error(` Error: Internal server error: ${error.message}`);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 },
    );
  }
}




   