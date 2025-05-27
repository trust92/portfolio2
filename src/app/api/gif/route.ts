import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import util from "util";

const execPromise = util.promisify(exec);

const VIDEO_DIR = process.env.VIDEO_DIR || "./public/videos";
const GIF_DIR = process.env.GIF_DIR || "./public/gifs";
const GIF_URL_PREFIX = process.env.NEXT_PUBLIC_GIF_URL_PREFIX || "/gifs";

export async function GET() {
  try {
    // Ensure directories exist
    await fs.mkdir(VIDEO_DIR, { recursive: true });
    await fs.mkdir(GIF_DIR, { recursive: true });

    // Input video path (sample)
    const inputVideo = path.join(VIDEO_DIR, "sample.mp4");

    // Verify input video exists
    try {
      await fs.access(inputVideo);
    } catch {
      return NextResponse.json({ error: "Input video not found" }, { status: 404 });
    }

    // Generate unique output filename with timestamp
    const timestamp = Date.now();
    const outputGif = path.join(GIF_DIR, `output-${timestamp}.gif`);
    const outputUrl = `${GIF_URL_PREFIX}/output-${timestamp}.gif`;

    // FFmpeg command: 5 seconds, 20 fps, 480p
    const ffmpegCommand = `ffmpeg -i "${inputVideo}" -vf "fps=20,scale=854:480" -t 5 "${outputGif}" -y`;

    try {
      await execPromise(ffmpegCommand);
    } catch (ffmpegError) {
      console.error("FFmpeg error:", ffmpegError);
      return NextResponse.json({ error: "Failed to generate GIF" }, { status: 500 });
    }

    // Verify output GIF exists
    try {
      await fs.access(outputGif);
    } catch {
      return NextResponse.json({ error: "GIF generation failed" }, { status: 500 });
    }

    return NextResponse.json({ url: outputUrl }, { status: 200 });
  } catch (error) {
    console.error("Error processing GIF:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}