/**
 * Configuration constants for the video gallery application.
 * Defines paths for assets, used directly in the application.
 *
 * @module lib/config
 */

  export const CORS_ORIGIN = '10.0.0.75';
export const IMAGE_DIR = '/images';
export const VIDEO_DIR = '/videos';
export const VIDEO_DIR_THUMBS = '/thumbnails';
export const VIDEO_DIR_PREVIEW = '/thumbnails/preview';
export const TAGS_CSV = '/tags.csv';
export const TAGS_CSV_URL = '/thumbnails/tags.csv';
export const MIN_VIDEO_DURATION = 1;
export const THUMBNAIL_RESOLUTION = '960:540';
export const GIF_RESOLUTION = '960:540';
export const GIF_FPS = 10;
export const GIF_DURATION = 2;
export const THUMBNAIL_TIMESTAMP = 0.1;
export const GIF_START_TIMESTAMP = 0.5;
export const APPLY_ANIMATED_OVERLAY = false;
export const AESTHETIC_EFFECTS = [
  'eq=contrast=1.2:brightness=0.05:saturation=1.3',
  'vignette=angle=PI/4',
  
];
export const API_ENDPOINTS = {
  videos: '/api/videos',
  gallery: '/api/gallery',
  settings: '/api/settings',
  fetchFailed: 'Failed to fetch data from endpoint'} as const;
