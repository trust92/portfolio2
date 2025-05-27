/**
 * API route for serving settings from config.ini.
 * Returns a flat key-value object combining [UI] and [Paths] sections.
 * Includes robust error handling and logging.
 *
 * @module app/api/settings/route
 * @requires next/server
 * @requires fs/promises
 * @requires path
 * @requires chalk
 * @requires ini
 */

import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { parse } from 'ini';

export async function GET() {
  try {
    const configPath = path.join(process.cwd(), 'config.ini');
    const configContent = await fs.readFile(configPath, 'utf-8');
    const parsedConfig = parse(configContent);

    // Flatten UI and Paths sections into a single object
    const settings = {
      ...parsedConfig.UI,
      ...parsedConfig.Paths,
    };

    console.log(chalk.green(`${new Date().toISOString()} INFO Served settings from config.ini`));
    return NextResponse.json(settings, {
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:3000',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.log(chalk.red(`${new Date().toISOString()} EROR Failed to serve settings: ${error.message}`));
    return NextResponse.json(
      { error: 'Failed to load settings', details: error.message },
      { status: 500 }
    );
  }
}