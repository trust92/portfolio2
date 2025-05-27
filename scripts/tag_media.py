"""
Main video processing pipeline for the video gallery application.
Generates JPEG thumbnails, WebM clips (merged for >60s), and tags for videos >5s.
Prompts for FPS, resolution, segment length, and tag count, uses .env for paths.

@module process_media

Input/Output Directories:
- Input:
  - VIDEO_DIR: ../public/videos (from .env VIDEO_DIR_PY) - Source of .mp4/.webm videos
  - INPUT_TAGS: ../public/selected_tags.csv (from .env INPUT_TAGS) - Candidate tags for CLIP
  - EXCLUSIONS: ../public/exclusions.csv (from .env EXCLUSIONS) - Tags to exclude
- Output:
  - THUMBS_DIR/preview: ../public/thumbnails/preview (from .env THUMBS_DIR) - JPEG thumbnails and WebM clips
  - TAGS_CSV: scripts/tags/tags.csv - Generated tags for videos
  - Backup: backup/backup_<timestamp> - Backup of thumbnails and tags.csv when clearing cache
- Log: media_processing.log - Debug and processing logs
"""

import os
import logging
import subprocess
import csv
from pathlib import Path
import ffmpeg
import shutil
import time
from colorama import init, Fore, Style
from tqdm import tqdm
from dotenv import load_dotenv
from PIL import Image
from transformers import pipeline
import pandas as pd
import hashlib
import tempfile
import psutil
import gc

# Initialize colorama for colored console output
init(autoreset=True)

# Load .env file
load_dotenv()

# Configuration
VIDEO_DIR = "./public/videos"
THUMBS_DIR = "./public/thumbnails"
TAGS_CSV = "../public/tags.csv"
INPUT_TAGS = "./public/selected_tags.csv"
EXCLUSIONS = "./public/exclusions.csv"
THUMBNAIL_URL_PREFIX = "/thumbnails"
DEFAULT_CANDIDATE_TAGS = [
    "cat", "dog", "car", "tree", "sky", "building", "person", "landscape", "night", "day",
    "beach", "forest", "city", "food", "animal", "water", "mountain", "road", "cloud", "sun"
]

# Custom logging level for success
logging.SUCCESS = 25
logging.addLevelName(logging.SUCCESS, "SUCCESS")

# Custom logging formatter for colored console output
class ColoredFormatter(logging.Formatter):
    COLORS = {
        'DEBUG': Fore.CYAN,
        'INFO': Fore.CYAN,
        'WARNING': Fore.YELLOW,
        'ERROR': Fore.RED,
        'SUCCESS': Fore.GREEN,
    }

    def format(self, record):
        log_message = super().format(record)
        return f"{self.COLORS.get(record.levelname, Fore.CYAN)}{log_message}{Style.RESET_ALL}"

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

file_handler = logging.FileHandler('media_processing.log')
file_handler.setLevel(logging.DEBUG)
file_handler.setFormatter(logging.Formatter(
    '%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
))

console_handler = logging.StreamHandler()
console_handler.setLevel(logging.DEBUG)
console_handler.setFormatter(ColoredFormatter(
    '%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
))

logger.addHandler(file_handler)
logger.addHandler(console_handler)

def clean_abandoned_processes():
    """Check for and terminate abandoned ffmpeg or Python processes, and clear memory."""
    logger.info("Checking for abandoned processes...")
    terminated_count = 0
    try:
        for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
            try:
                proc_name = proc.info['name'].lower()
                cmdline = proc.info['cmdline'] or []
                if ('ffmpeg' in proc_name or 'python' in proc_name) and any('process_media.py' in arg or 'ffmpeg' in arg for arg in cmdline):
                    logger.warning(f"Found potentially abandoned process: {proc_name} (PID: {proc.pid})")
                    proc.terminate()
                    try:
                        proc.wait(timeout=3)
                        logger.log(logging.SUCCESS, f"Terminated process: {proc_name} (PID: {proc.pid})")
                        terminated_count += 1
                    except psutil.TimeoutExpired:
                        logger.warning(f"Process {proc_name} (PID: {proc.pid}) did not terminate, killing...")
                        proc.kill()
                        terminated_count += 1
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        if terminated_count > 0:
            logger.log(logging.SUCCESS, f"Terminated {terminated_count} abandoned processes")
        else:
            logger.info("No abandoned processes found")
        
        # Clear memory
        gc.collect()
        logger.debug("Garbage collection performed to free memory")
    except Exception as e:
        logger.error(f"Error during process cleanup: {str(e)}")

def get_path(*segments: str) -> Path:
    """Generate a path relative to the project, handling .env variables."""
    try:
        base = Path(os.getenv(segments[0], segments[0]) if segments[0] in os.environ else segments[0])
        full_path = base.joinpath(*segments[1:]).resolve()
        logger.debug(f"Resolved path for {segments}: {full_path}")
        return full_path
    except Exception as e:
        logger.error(f"Failed to resolve path for {segments}: {str(e)}")
        raise

def get_file_hash(file_path: str) -> str:
    """Compute SHA256 hash of a file."""
    sha256 = hashlib.sha256()
    try:
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                sha256.update(chunk)
        return sha256.hexdigest()
    except Exception as e:
        logger.error(f"Failed to hash {file_path}: {str(e)}")
        return ""

def get_video_resolution(file_path: str) -> tuple[int, int]:
    """Get video resolution using ffprobe."""
    try:
        probe = ffmpeg.probe(file_path)
        video_stream = next(s for s in probe["streams"] if s["codec_type"] == "video")
        return int(video_stream["width"]), int(video_stream["height"])
    except ffmpeg.Error as e:
        logger.error(f"FFprobe resolution error for {file_path}: {e.stderr.decode()}")
        return 0, 0
    except Exception as e:
        logger.error(f"Unexpected error getting resolution for {file_path}: {str(e)}")
        return 0, 0

def get_video_duration(file_path: str) -> float:
    """Get video duration using ffprobe."""
    try:
        probe = ffmpeg.probe(file_path)
        duration = float(probe["format"]["duration"])
        logger.info(f"Duration for {file_path}: {duration:.2f}s")
        return duration
    except ffmpeg.Error as e:
        logger.error(f"FFprobe error for {file_path}: {e.stderr.decode()}")
        return 0
    except Exception as e:
        logger.error(f"Unexpected error getting duration for {file_path}: {str(e)}")
        return 0

def generate_jpeg(file_path: str, video_id: str, duration: float, resolution: str) -> str:
    """Generate a JPEG thumbnail at 10% of duration, expanding to fill target resolution."""
    preview_dir = get_path(THUMBS_DIR, "preview")
    preview_dir.mkdir(parents=True, exist_ok=True)
    jpeg_path = preview_dir / f"{video_id}_thumb.jpg"

    timestamp = min(max(duration * 0.1, 0), duration)
    target_width, target_height = map(int, resolution.split(':'))
    input_width, input_height = get_video_resolution(file_path)
    logger.debug(f"Input resolution for {video_id}: {input_width}x{input_height}, Target: {resolution}")

    # Scale to fill target resolution, maintaining aspect ratio, no padding
    scale = f"scale={target_width}:{target_height}:force_original_aspect_ratio=increase:force_divisible_by=2"

    try:
        subprocess.run(
            [
                "ffmpeg", "-i", file_path, "-ss", str(timestamp), "-vframes", "1",
                "-vf", scale,
                "-q:v", "6", str(jpeg_path), "-y"
            ],
            check=True, capture_output=True, text=True
        )
        jpeg_size = jpeg_path.stat().st_size / 1024
        logger.log(logging.SUCCESS, f"Generated JPEG for {video_id}: {jpeg_path} ({jpeg_size:.2f} KB)")
        return f"{THUMBNAIL_URL_PREFIX}/preview/{video_id}_thumb.jpg"
    except subprocess.CalledProcessError as e:
        logger.error(f"FFmpeg JPEG error for {video_id}: {e.stderr}")
        return ""
    except Exception as e:
        logger.error(f"Unexpected error generating JPEG for {video_id}: {str(e)}")
        return ""

def generate_webm(file_path: str, video_id: str, duration: float, fps: int, resolution: str, segment_length: int) -> list:
    """Generate WebM clips: one for <60s (middle), three for >60s (10s, middle, end-20s), merge if >60s, expanding to fill target resolution."""
    preview_dir = get_path(THUMBS_DIR, "preview")
    preview_dir.mkdir(parents=True, exist_ok=True)
    webm_urls = []

    target_width, target_height = map(int, resolution.split(':'))
    input_width, input_height = get_video_resolution(file_path)
    logger.debug(f"Input resolution for {video_id}: {input_width}x{input_height}, Target: {resolution}")

    # Scale to fill target resolution, maintaining aspect ratio, no padding
    scale = f"scale={target_width}:{target_height}:force_original_aspect_ratio=increase:force_divisible_by=2"

    clips = []
    temp_files = []
    if duration > 60:
        clips = [
            (10, f"{video_id}_start.webm"),  # Start: 10s in
            (duration * 0.5, f"{video_id}_middle.webm"),  # Middle
            (duration - 20, f"{video_id}_end.webm")  # End: 20s from end
        ]
    else:
        clips = [(duration * 0.5, f"{video_id}.webm")]  # Middle

    # Generate individual clips
    for start_time, filename in clips:
        webm_path = preview_dir / filename
        temp_files.append(webm_path)
        start_time = min(max(start_time, 0), duration - segment_length)  # Ensure within bounds
        try:
            subprocess.run(
                [
                    "ffmpeg", "-i", file_path, "-ss", str(start_time), "-t", str(segment_length),
                    "-vf", f"fps={fps},{scale}",
                    "-c:v", "libvpx-vp9", "-b:v", "1M", "-an", str(webm_path), "-y"
                ],
                check=True, capture_output=True, text=True
            )
            webm_size = webm_path.stat().st_size / 1024
            logger.log(logging.SUCCESS, f"Generated WebM segment for {video_id}: {webm_path} ({webm_size:.2f} KB)")
        except subprocess.CalledProcessError as e:
            logger.error(f"FFmpeg WebM segment error for {video_id}: {e.stderr}")
            return []
        except Exception as e:
            logger.error(f"Unexpected error generating WebM segment for {video_id}: {str(e)}")
            return []

    # Merge clips for videos >60s
    final_webm = f"{video_id}.webm"
    final_webm_path = preview_dir / final_webm
    if duration > 60:
        try:
            with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as concat_file:
                for _, clip_filename in clips:
                    concat_file.write(f"file '{preview_dir / clip_filename}'\n")
                concat_file_path = concat_file.name

            subprocess.run(
                [
                    "ffmpeg", "-f", "concat", "-safe", "0", "-i", concat_file_path,
                    "-c", "copy", str(final_webm_path), "-y"
                ],
                check=True, capture_output=True, text=True
            )
            os.unlink(concat_file_path)
            final_size = final_webm_path.stat().st_size / 1024
            logger.log(logging.SUCCESS, f"Merged WebM for {video_id}: {final_webm_path} ({final_size:.2f} KB)")
            webm_urls = [f"{THUMBNAIL_URL_PREFIX}/preview/{final_webm}"]
            
            # Clean up temporary segment files
            for temp_file in temp_files:
                try:
                    temp_file.unlink()
                    logger.debug(f"Removed temporary WebM segment: {temp_file}")
                except OSError as e:
                    logger.error(f"Failed to remove temporary WebM segment {temp_file}: {str(e)}")
        except subprocess.CalledProcessError as e:
            logger.error(f"FFmpeg merge error for {video_id}: {e.stderr}")
            return []
        except Exception as e:
            logger.error(f"Unexpected error merging WebM for {video_id}: {str(e)}")
            return []
    else:
        webm_urls = [f"{THUMBNAIL_URL_PREFIX}/preview/{clips[0][1]}"]

    return webm_urls

def load_candidate_tags() -> list:
    """Load candidate tags from INPUT_TAGS, exclude tags from EXCLUSIONS, fallback to DEFAULT_CANDIDATE_TAGS."""
    logger.info(f"Loading candidate tags from {INPUT_TAGS}...")
    try:
        df = pd.read_csv(INPUT_TAGS, dtype={'tag_id': str, 'name': str, 'category': str, 'count': int})
        if not all(col in df.columns for col in ['tag_id', 'name', 'category', 'count']):
            logger.error(f"Invalid CSV format in {INPUT_TAGS}: Missing required columns")
            return DEFAULT_CANDIDATE_TAGS
        if df['tag_id'].duplicated().any():
            logger.warning(f"Duplicate tag_ids found in {INPUT_TAGS}")
        if df['name'].isna().any() or (df['name'] == '').any():
            logger.warning(f"Empty or missing tag names in {INPUT_TAGS}")
        valid_tags = df[df['name'].notna() & (df['name'] != '') & (df['count'] > 100)]
        tags = valid_tags.sort_values('count', ascending=False)['name'].tolist()

        excluded_tags = set()
        try:
            exclusions_df = pd.read_csv(EXCLUSIONS)
            if 'name' in exclusions_df.columns:
                excluded_tags = set(exclusions_df['name'].dropna().str.lower())
                logger.info(f"Loaded {len(excluded_tags)} excluded tags from {EXCLUSIONS}")
            else:
                logger.warning(f"No 'name' column found in {EXCLUSIONS}, skipping exclusions")
        except FileNotFoundError:
            logger.warning(f"{EXCLUSIONS} not found, skipping exclusions")
        except pd.errors.ParserError:
            logger.warning(f"Failed to parse {EXCLUSIONS}: Invalid CSV format, skipping exclusions")
        except Exception as e:
            logger.error(f"Unexpected error loading {EXCLUSIONS}: {str(e)}")
            logger.warning("Skipping exclusions due to error")

        filtered_tags = [tag for tag in tags if tag.lower() not in excluded_tags]
        if not filtered_tags:
            logger.warning(f"No valid tags remain after filtering exclusions from {INPUT_TAGS}")
            return DEFAULT_CANDIDATE_TAGS
        logger.log(logging.SUCCESS, f"Loaded {len(filtered_tags)} candidate tags from {INPUT_TAGS}")
        return filtered_tags[:50]
    except FileNotFoundError:
        logger.error(f"{INPUT_TAGS} not found")
        return DEFAULT_CANDIDATE_TAGS
    except pd.errors.ParserError:
        logger.error(f"Failed to parse {INPUT_TAGS}: Invalid CSV format")
        return DEFAULT_CANDIDATE_TAGS
    except Exception as e:
        logger.error(f"Unexpected error loading {INPUT_TAGS}: {str(e)}")
        return DEFAULT_CANDIDATE_TAGS

def tag_image(image_path: str, tagger, candidate_tags: list, num_tags: int) -> list:
    """Tag image using CLIP pipeline, return specified number of tags with confidence scores."""
    logger.debug(f"Tagging image: {image_path}")
    try:
        image = Image.open(image_path).convert("RGB")
        results = tagger(image, candidate_labels=candidate_tags)
        tag_data = sorted(results, key=lambda x: x['score'], reverse=True)[:num_tags]
        tags = [item['label'] for item in tag_data]
        logger.log(logging.SUCCESS, f"Tags for {image_path}: {', '.join(f'{item['label']} ({item['score']:.2f})' for item in tag_data)}")
        return tags
    except Exception as e:
        logger.error(f"Error tagging {image_path}: {str(e)}")
        return []

def load_existing_tags() -> list:
    """Load existing tags.csv if it exists."""
    tags_csv_path = get_path(TAGS_CSV)
    logger.debug(f"Checking for existing {tags_csv_path}...")
    tags_data = []
    if tags_csv_path.exists():
        try:
            with open(tags_csv_path, "r", newline="") as f:
                reader = csv.DictReader(f)
                tags_data = list(reader)
            logger.info(f"Loaded {len(tags_data)} existing tags from {tags_csv_path}")
        except Exception as e:
            logger.error(f"Failed to load {tags_csv_path}: {str(e)}")
    return tags_data

def clean_orphaned_tags(tags_data: list, video_files: list) -> list:
    """Remove tags for videos no longer in VIDEO_DIR."""
    logger.info("Cleaning orphaned tags...")
    video_ids = {Path(v).stem for v in video_files}
    valid_tags = []
    removed_count = 0
    for entry in tags_data:
        media_id = entry["media_id"]
        if media_id in video_ids:
            valid_tags.append(entry)
        else:
            logger.warning(f"Removed orphaned tag for video:{media_id}")
            removed_count += 1
    logger.log(logging.SUCCESS, f"Cleaned {removed_count} orphaned tags, {len(valid_tags)} tags retained")
    return valid_tags

def clean_thumbnails(video_files: list):
    """Remove orphaned thumbnails and WebM clips in THUMBS_DIR/preview."""
    preview_dir = get_path(THUMBS_DIR, "preview")
    preview_dir.mkdir(parents=True, exist_ok=True)
    video_ids = {Path(v).stem for v in video_files}
    removed_count = 0

    logger.info("Cleaning orphaned thumbnails and WebM clips...")
    try:
        for file in preview_dir.glob("*"):
            file_id = file.stem.replace("_thumb", "").replace("_start", "").replace("_middle", "").replace("_end", "")
            if file_id not in video_ids:
                try:
                    file.unlink()
                    logger.log(logging.SUCCESS, f"Removed orphaned file: {file}")
                    removed_count += 1
                except OSError as e:
                    logger.error(f"Failed to remove {file}: {str(e)}")
        logger.log(logging.SUCCESS, f"Cleaned {removed_count} orphaned files")
    except Exception as e:
        logger.error(f"Unexpected error during thumbnail cleanup: {str(e)}")

def get_video_files() -> list:
    """Scan VIDEO_DIR recursively for .mp4 and .webm files."""
    video_dir = get_path(VIDEO_DIR)
    video_files = []
    try:
        for file in video_dir.rglob("*"):
            if file.suffix.lower() in [".mp4", ".webm"]:
                video_files.append(str(file.relative_to(video_dir)))
        logger.info(f"Found {len(video_files)} videos")
        return sorted(video_files)
    except OSError as e:
        logger.error(f"Failed to scan {VIDEO_DIR}: {str(e)}")
        return []
    except Exception as e:
        logger.error(f"Unexpected error scanning {VIDEO_DIR}: {str(e)}")
        return []

def prompt_user() -> tuple[bool, bool, bool, int, str, int, int]:
    """Prompt user for thumbnail/WebM generation, tagging, cache clearing, FPS, resolution, segment length, and tag count."""
    logger.info(f"{Fore.MAGENTA}Starting media processing configuration...")
    
    # Print working directory
    working_dir = os.getcwd()
    logger.info(f"{Fore.RED}Working directory: {working_dir}{Style.RESET_ALL}")

    while True:
        response = input(f"{Fore.CYAN}Generate thumbnails and WebM clips for videos? (y/n): {Style.RESET_ALL}").strip().lower()
        if response in ['y', 'n']:
            generate_thumbs = response == 'y'
            break
        logger.warning("Invalid input, please enter 'y' or 'n'")

    while True:
        response = input(f"{Fore.CYAN}Generate tags for thumbnails? (y/n): {Style.RESET_ALL}").strip().lower()
        if response in ['y', 'n']:
            generate_tags = response == 'y'
            break
        logger.warning("Invalid input, please enter 'y' or 'n'")

    clear_cache = False
    if generate_thumbs or generate_tags:
        while True:
            response = input(f"{Fore.YELLOW}Clear thumbnail, WebM, and tag cache? This will back up existing files. (y/n): {Style.RESET_ALL}").strip().lower()
            if response in ['y', 'n']:
                clear_cache = response == 'y'
                break
            logger.warning("Invalid input, please enter 'y' or 'n'")

    fps = 20
    if generate_thumbs:
        while True:
            try:
                response = input(f"{Fore.CYAN}Enter FPS for WebM clips (default 20): {Style.RESET_ALL}").strip()
                fps = int(response) if response else 20
                if fps > 0:
                    break
                logger.warning("FPS must be positive")
            except ValueError:
                logger.warning("Invalid input, please enter a number")

    resolution = "480:270"
    if generate_thumbs:
        while True:
            response = input(f"{Fore.CYAN}Enter resolution width (320–1080, maintains aspect ratio, default 720): {Style.RESET_ALL}").strip()
            try:
                width = int(response) if response else 720
                if 320 <= width <= 1080:
                    height = int(width * 9 / 16)  # Assume 16:9 aspect ratio
                    resolution = f"{width}:{height}"
                    break
                logger.warning("Width must be between 320 and 1080")
            except ValueError:
                logger.warning("Invalid input, please enter a number")

    segment_length = 1
    if generate_thumbs:
        while True:
            try:
                response = input(f"{Fore.CYAN}Enter segment length for WebM clips (1–20 seconds, default 2): {Style.RESET_ALL}").strip()
                segment_length = int(response) if response else 2
                if 1 <= segment_length <= 20:
                    break
                logger.warning("Segment length must be between 1 and 20 seconds")
            except ValueError:
                logger.warning("Invalid input, please enter a number")

    num_tags = 15
    if generate_tags:
        while True:
            try:
                response = input(f"{Fore.CYAN}Enter number of tags to generate (default 30): {Style.RESET_ALL}").strip()
                num_tags = int(response) if response else 30
                if num_tags > 0:
                    break
                logger.warning("Number of tags must be positive")
            except ValueError:
                logger.warning("Invalid input, please enter a number")

    logger.info(f"Configuration: Thumbnails/WebM={generate_thumbs}, Tags={generate_tags}, Clear Cache={clear_cache}, FPS={fps}, Resolution={resolution}, Segment Length={segment_length}s, Tags Count={num_tags}")
    return generate_thumbs, generate_tags, clear_cache, fps, resolution, segment_length, num_tags

def process_media():
    """Generate thumbnails, WebM clips, and tags for videos, with user prompts and duplication checks."""
    start_time = time.time()
    logger.info(f"{Fore.MAGENTA}Starting media processing...")

    # Clean up any abandoned processes before starting
    clean_abandoned_processes()

    # Get user preferences
    generate_thumbs, generate_tags, clear_cache, fps, resolution, segment_length, num_tags = prompt_user()

    # Resolve TAGS_CSV path and ensure directory exists
    tags_csv_path = get_path(TAGS_CSV)
    tags_csv_dir = tags_csv_path.parent
    tags_csv_dir.mkdir(parents=True, exist_ok=True)
    logger.info(f"Resolved tags.csv path: {tags_csv_path}")

    # Get video files
    video_files = get_video_files()
    total_videos = len(video_files)
    success_count = 0
    tags_data = load_existing_tags() if generate_tags else []
    existing_tag_ids = {entry["media_id"] for entry in tags_data}

    # Handle cache clearing
    if clear_cache:
        logger.info("Initiating cache clearing...")
        backup_dir = Path("backup") / f"backup_{time.strftime('%Y%m%d_%H%M%S')}"
        backup_dir.mkdir(parents=True, exist_ok=True)

        preview_dir = get_path(THUMBS_DIR, "preview")
        if preview_dir.exists():
            try:
                shutil.copytree(preview_dir, backup_dir / "thumbnails")
                logger.log(logging.SUCCESS, f"Backed up thumbnails and WebM clips to {backup_dir / 'thumbnails'}")
            except Exception as e:
                logger.error(f"Failed to back up thumbnails: {str(e)}")
                return

        if tags_csv_path.exists():
            try:
                shutil.copy(tags_csv_path, backup_dir / "tags.csv")
                logger.log(logging.SUCCESS, f"Backed up {tags_csv_path} to {backup_dir / 'tags.csv'}")
            except Exception as e:
                logger.error(f"Failed to back up {tags_csv_path}: {str(e)}")
                return

        try:
            if preview_dir.exists():
                shutil.rmtree(preview_dir)
                logger.log(logging.SUCCESS, f"Cleared thumbnail and WebM cache: {preview_dir}")
            if tags_csv_path.exists():
                tags_csv_path.unlink()
                logger.log(logging.SUCCESS, f"Cleared tags cache: {tags_csv_path}")
            preview_dir.mkdir(parents=True, exist_ok=True)
            tags_data = []
            existing_tag_ids = set()
        except Exception as e:
            logger.error(f"Failed to clear cache: {str(e)}")
            return

    # Load CLIP pipeline for tagging
    tagger = None
    if generate_tags:
        logger.debug("Loading CLIP pipeline...")
        try:
            tagger = pipeline("zero-shot-image-classification", model="openai/clip-vit-base-patch32")
            logger.log(logging.SUCCESS, "CLIP pipeline loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load CLIP pipeline: {str(e)}")
            logger.warning("Continuing with empty tags due to model failure")

    # Load candidate tags
    candidate_tags = load_candidate_tags() if generate_tags else []

    # Clean orphaned thumbnails and WebM clips (if not cleared)
    if generate_thumbs and not clear_cache:
        clean_thumbnails(video_files)

    # Process videos
    for i, rel_path in enumerate(tqdm(video_files, desc="Processing videos", unit="video"), 1):
        file_path = get_path(VIDEO_DIR, rel_path)
        video_id = Path(rel_path).stem
        logger.info(f"{Fore.MAGENTA}Processing video {i}/{total_videos}: {rel_path}")

        try:
            duration = get_video_duration(str(file_path))
            if duration < 5:
                logger.warning(f"Skipping {rel_path}: Duration {duration:.2f}s < 5s")
                continue

            # Generate thumbnail and WebM clips if needed
            jpeg_url = ""
            webm_urls = []
            jpeg_path = get_path(THUMBS_DIR, "preview", f"{video_id}_thumb.jpg")
            webm_base_path = get_path(THUMBS_DIR, "preview", f"{video_id}.webm")
            if generate_thumbs:
                if not jpeg_path.exists():
                    jpeg_url = generate_jpeg(str(file_path), video_id, duration, resolution)
                    if not jpeg_url:
                        logger.warning(f"Failed to generate JPEG for {rel_path}")
                        continue
                else:
                    jpeg_url = f"{THUMBNAIL_URL_PREFIX}/preview/{video_id}_thumb.jpg"
                    logger.info(f"JPEG exists: {jpeg_path} ({jpeg_path.stat().st_size / 1024:.2f} KB)")

                if not webm_base_path.exists():
                    webm_urls = generate_webm(str(file_path), video_id, duration, fps, resolution, segment_length)
                    if not webm_urls:
                        logger.warning(f"Failed to generate WebM clips for {rel_path}")
                        continue
                else:
                    webm_urls = [f"{THUMBNAIL_URL_PREFIX}/preview/{video_id}.webm"]
                    for url in webm_urls:
                        path = get_path(THUMBS_DIR, "preview", Path(url).name)
                        logger.info(f"WebM exists: {path} ({path.stat().st_size / 1024:.2f} KB)")
            elif not (jpeg_path.exists() and webm_base_path.exists()):
                logger.warning(f"Thumbnail or WebM missing for {rel_path}, but generation disabled")
                continue

            # Generate tags if needed
            if generate_tags and video_id not in existing_tag_ids:
                tags = []
                if tagger:
                    tags = tag_image(str(jpeg_path), tagger, candidate_tags, num_tags)
                    if not tags:
                        logger.warning(f"No tags generated for {rel_path}")
                else:
                    logger.warning(f"Skipping tagging for {rel_path} due to model failure")
                tags_data.append({
                    "media_id": video_id,
                    "media_type": "video",
                    **{f"tag{i}": tag for i, tag in enumerate(tags, 1)}
                })
                success_count += 1
            elif video_id in existing_tag_ids:
                logger.info(f"Tags already exist for {video_id}, skipping")

        except Exception as e:
            logger.error(f"Unexpected error processing {rel_path}: {str(e)}")

    # Clean orphaned tags
    if generate_tags:
        tags_data = clean_orphaned_tags(tags_data, video_files)

    # Write tags.csv
    if generate_tags and tags_data:
        logger.debug(f"Writing tags.csv to {tags_csv_path}...")
        try:
            with open(tags_csv_path, "w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=["media_id", "media_type"] + [f"tag{i}" for i in range(1, max(21, num_tags + 1))])
                writer.writeheader()
                writer.writerows(tags_data)
            if tags_csv_path.exists():
                logger.log(logging.SUCCESS, f"Generated {tags_csv_path}: {len(tags_data)} videos tagged, size: {tags_csv_path.stat().st_size / 1024:.2f} KB")
            else:
                logger.error(f"{tags_csv_path} was not created")
        except Exception as e:
            logger.error(f"Failed to write {tags_csv_path}: {str(e)}")
    elif generate_tags and not tags_data:
        logger.warning(f"No tags to write to {tags_csv_path}, skipping file creation")

    # Clean up CLIP pipeline to free memory
    if tagger:
        logger.debug("Clearing CLIP pipeline to free memory")
        tagger = None
        gc.collect()

    elapsed_time = time.time() - start_time
    logger.info(
        f"{Fore.MAGENTA}Media processing complete: {success_count}/{total_videos} videos processed "
        f"in {elapsed_time:.2f} seconds"
    )

if __name__ == "__main__":
    process_media()