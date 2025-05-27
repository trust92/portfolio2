import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';

export async function GET(request: Request, context: { params: Promise<{ image: string }> }) {
  const log = {
    info: (msg: string) => console.log(chalk.cyan(`[${new Date().toISOString()}] [INFO] ${msg}`)),
    success: (msg: string) => console.log(chalk.green(`[${new Date().toISOString()}] [SUCCESS] ${msg}`)),
    warn: (msg: string) => console.log(chalk.yellow(`[${new Date().toISOString()}] [WARNING] ${msg}`)),
    error: (msg: string) => console.log(chalk.red(`[${new Date().toISOString()}] [ERROR] ${msg}`)),
  };

const IMAGE_DIR = './public/images/'

  try {
    const params = await context.params;
    const { image } = params;

    // Validate image parameter
    if (!image || typeof image !== 'string') {
      log.error('Invalid image parameter: Missing or non-string');
      return Response.json(
        { error: 'Invalid image parameter', details: 'Image name must be a non-empty string' },
        { status: 400 }
      );
    }

    // Prevent path traversal
    if (image.includes('..') || image.includes('/') || image.includes('\\')) {
      log.error(`Path traversal attempt detected: ${image}`);
      return Response.json(
        { error: 'Invalid image path', details: 'Path traversal characters are not allowed' },
        { status: 400 }
      );
    }

    // Construct file path
    const filePath = path.join(IMAGE_DIR, image);
    log.info(`Attempting to serve image: ${filePath}`);

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        log.warn(`Image not found: ${filePath}`);
        return Response.json(
          { error: 'Image not found', details: `File ${image} does not exist` },
          { status: 404 }
        );
      }
      if ((error as NodeJS.ErrnoException).code === 'EACCES') {
        log.error(`Permission denied for ${filePath}: ${(error as Error).message}`);
        return Response.json(
          { error: 'Permission denied', details: `Access to ${image} is restricted` },
          { status: 403 }
        );
      }
      throw error; // Other errors handled below
    }

    // Read image file
    const imageBuffer = await fs.readFile(filePath);

    // Determine content type
    const contentType = image.endsWith('.png')
      ? 'image/png'
      : image.endsWith('.webp')
      ? 'image/webp'
      : 'image/jpeg';

    log.success(`Successfully served image: ${filePath}`);
    return new Response(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000',
        'X-Content-Type-Options': 'nosniff', // Prevent MIME-type sniffing
      },
    });
  } catch (error) {
    const err = error as Error;
    log.error(`Internal server error: ${err.message}\n${err.stack || 'No stack trace'}`);
    return Response.json(
      { error: 'Internal server error', details: err.message },
      { status: 500 }
    );
  }
}