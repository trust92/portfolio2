import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET(request: Request, context: { params: Promise<{ filename: string }> }) {
  const params = await context.params;
  const filename = params.filename;

  // Validate file extension
  if (!filename.toLowerCase().endsWith('.mp4')) {
    return NextResponse.json({ error: 'Only MP4 files are supported' }, { status: 400 });
  }

  // Hardcode video directory path
  const videoDir = './videos';
  const filePath = path.join(process.cwd(), videoDir, filename);

  try {
    // Check if file exists
    await fs.access(filePath);

    // Read file content
    const fileBuffer = await fs.readFile(filePath);

    // Return video file with appropriate headers
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Access-Control-Allow-Origin': '*', // Allow all origins
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
      },
    });
  } catch (error) {
    console.error(`Error serving file ${filename}:`, error);
    return NextResponse.json({ error: 'File not found or inaccessible' }, { status: 404 });
  }
}