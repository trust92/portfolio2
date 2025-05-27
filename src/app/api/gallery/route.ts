// api/gallery/route.ts
// API route to fetch gallery images
import { promises as fs } from 'fs';
import path from 'path';

const IMAGE_DIR = './public/images/'
export async function GET() {
  try {
    const files = await fs.readdir(IMAGE_DIR).catch(() => []);
    console.log('Image directory:', {IMAGE_DIR})
    const imageFiles = files
      .filter(file => file.endsWith('.png') || file.endsWith('.webp') || file.endsWith('.webm') || file.endsWith('.jpg'))
      .map(file => ({ path: path.join(IMAGE_DIR, file) }));

    const filesWithStats = await Promise.all(imageFiles.map(async file => {
      const stats = await fs.stat(file.path);
      return { image: `/api/image/${path.basename(file.path)}`, ctime: stats.ctime };
    }));

    filesWithStats.sort((a, b) => b.ctime.getTime() - a.ctime.getTime());
    const latest = filesWithStats[0] || { image: null, ctime: null };
    const images = filesWithStats.map(item => ({ image: item.image }));
console.log(IMAGE_DIR)
    return Response.json({ latest, images });
  } catch (error) {
    console.error('Gallery API error:', error);
    return Response.json({ error: 'Failed to fetch images' }, { status: 500 });
  }
}