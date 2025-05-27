#process_media.py
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
VIDEO_DIR = os.getenv("VIDEO_DIR_PY", "../public/videos")
THUMBS_DIR = os.getenv("THUMBS_DIR", "../public/thumbnails")
GIF_DIR = os.getenv("GIF_DIR", "../public/gifs")
TAGS_CSV = "scripts/tags/tags.csv"
INPUT_TAGS = os.getenv("INPUT_TAGS", "../public/selected_tags.csv")
EXCLUSIONS = os.getenv("EXCLUSIONS", "../public/exclusions.csv")
THUMBNAIL_URL_PREFIX = os.getenv("THUMBNAIL_URL_PREFIX", "/thumbnails")
GIF_URL_PREFIX = os.getenv("GIF_URL_PREFIX", "/gifs")
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
logger.setLevel(logging.INFO)

file_handler = logging.FileHandler('media_processing.log')
file_handler.setLevel(logging.DEBUG)
file_handler.setFormatter(logging.Formatter(
    '%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
))

console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)
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
    """Generate WebM clips: one for <60s (middle), three for >60s (10s, middle, end-20s), merge if >60s."""
    preview_dir = get_path(THUMBS_DIR, "preview")
    preview_dir.mkdir(parents=True, exist_ok=True)
    webm_urls = []

    target_width, target_height = map(int, resolution.split(':'))
    input_width, input_height = get_video_resolution(file_path)
    logger.debug(f"Input resolution for {video_id}: {input_width}x{input_height}, Target: {resolution}")

    scale = f"scale={target_width}:{target_height}:force_original_aspect_ratio=increase:force_divisible_by=2"

    clips = []
    temp_files = []
    if duration > 60:
        clips = [
            (10, f"{video_id}_start.webm"),
            (duration * 0.5, f"{video_id}_middle.webm"),
            (duration - 20, f"{video_id}_end.webm")
        ]
    else:
        clips = [(duration * 0.5, f"{video_id}.webm")]

    for start_time, filename in clips:
        webm_path = preview_dir / filename
        temp_files.append(webm_path)
        start_time = min(max(start_time, 0), duration - segment_length)
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

def generate_gif(file_path: str, video_id: str, duration: float) -> str:
    """Generate a 5-second GIF (5 x 1-second segments) at 480p, 20 fps."""
    gif_dir = get_path(GIF_DIR)
    gif_dir.mkdir(parents=True, exist_ok=True)
    
    if duration < 5:
        logger.warning(f"Cannot generate GIF for {video_id}: Duration {duration:.2f}s < 5s")
        return ""

    gif_filename = f"{video_id}.gif"
    gif_path = gif_dir / gif_filename
    gif_url = f"{GIF_URL_PREFIX}/{gif_filename}"

    temp_files = []
    try:
        # Generate five 1-second segments
        for i in range(5):
            temp_segment = gif_dir / f"{video_id}_segment_{i}.gif"
            temp_files.append(temp_segment)
            try:
                subprocess.run(
                    [
                        "ffmpeg", "-i", file_path, "-ss", str(i), "-t", "1",
                        "-vf", "fps=20,scale=854:480:force_original_aspect_ratio=increase:force_divisible_by=2",
                        "-q:v", "6", str(temp_segment), "-y"
                    ],
                    check=True, capture_output=True, text=True
                )
                logger.debug(f"Generated GIF segment {i} for {video_id}: {temp_segment}")
            except subprocess.CalledProcessError as e:
                logger.error(f"FFmpeg GIF segment error for {video_id}: {e.stderr}")
                return ""

        # Concatenate segments
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as concat_file:
            for i in range(5):
                concat_file.write(f"file '{gif_dir / f'{video_id}_segment_{i}.gif'}'\n")
            concat_file_path = concat_file.name

        try:
            subprocess.run(
                [
                    "ffmpeg", "-f", "concat", "-safe", "0", "-i", concat_file_path,
                    "-c", "copy", str(gif_path), "-y"
                ],
                check=True, capture_output=True, text=True
            )
            os.unlink(concat_file_path)
            gif_size = gif_path.stat().st_size / 1024
            logger.log(logging.SUCCESS, f"Generated GIF for {video_id}: {gif_path} ({gif_size:.2f} KB)")
            return gif_url
        except subprocess.CalledProcessError as e:
            logger.error(f"FFmpeg GIF merge error for {video_id}: {e.stderr}")
            return ""
        finally:
            for temp_file in temp_files:
                try:
                    temp_file.unlink()
                    logger.debug(f"Removed temporary GIF segment: {temp_file}")
                except OSError as e:
                    logger.error(f"Failed to remove temporary GIF segment {temp_file}: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error generating GIF for {video_id}: {str(e)}")
        return ""

def load_candidate_tags() -> list:
    """Load candidate tags from INPUT_TAGS, exclude tags from EXCLUSIONS."""
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
        except FileNotFoundError:
            logger.warning(f"{EXCLUSIONS} not found, skipping exclusions")
        except pd.errors.ParserError:
            logger.warning(f"Failed to parse {EXCLUSIONS}: Invalid CSV format")

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
    """Tag image using CLIP pipeline."""
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

def append_tags(tags_csv_path: Path, entry: dict):
    """Append a single tag entry to tags.csv."""
    try:
        file_exists = tags_csv_path.exists()
        with open(tags_csv_path, "a", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=["media_id", "media_type"] + [f"tag{i}" for i in range(1, max(21, len(entry) - 1))])
            if not file_exists:
                writer.writeheader()
            writer.writerow(entry)
        logger.log(logging.SUCCESS, f"Appended tags for {entry['media_id']} to {tags_csv_path}")
    except Exception as e:
        logger.error(f"Failed to append tags to {tags_csv_path}: {str(e)}")

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
    """Remove tags for videos or GIFs no longer in VIDEO_DIR or GIF_DIR."""
    logger.info("Cleaning orphaned tags...")
    video_ids = {Path(v).stem for v in video_files}
    gif_ids = {f"gif_{Path(v).stem}" for v in video_files}
    valid_tags = []
    removed_count = 0
    for entry in tags_data:
        media_id = entry["media_id"]
        if media_id in video_ids or media_id in gif_ids:
            valid_tags.append(entry)
        else:
            logger.warning(f"Removed orphaned tag for media:{media_id}")
            removed_count += 1
    logger.log(logging.SUCCESS, f"Cleaned {removed_count} orphaned tags, {len(valid_tags)} tags retained")
    return valid_tags

def clean_thumbnails_and_gifs(video_files: list):
    """Remove orphaned thumbnails, WebM clips, and GIFs."""
    preview_dir = get_path(THUMBS_DIR, "preview")
    gif_dir = get_path(GIF_DIR)
    preview_dir.mkdir(parents=True, exist_ok=True)
    gif_dir.mkdir(parents=True, exist_ok=True)
    video_ids = {Path(v).stem for v in video_files}
    removed_count = 0

    logger.info("Cleaning orphaned thumbnails, WebM clips, and GIFs...")
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
        for file in gif_dir.glob("*.gif"):
            file_id = file.stem
            if file_id not in video_ids:
                try:
                    file.unlink()
                    logger.log(logging.SUCCESS, f"Removed orphaned GIF: {file}")
                    removed_count += 1
                except OSError as e:
                    logger.error(f"Failed to remove GIF {file}: {str(e)}")
        logger.log(logging.SUCCESS, f"Cleaned {removed_count} orphaned files")
    except Exception as e:
        logger.error(f"Unexpected error during cleanup: {str(e)}")

def get_video_files() -> list:
    """Scan VIDEO_DIR recursively for .mp4 and .webm files."""
    video_dir = get_path(VIDEO_DIR)
    video_files = []
    try:
        for file in video_dir.rglob("*"):
            if file.suffix.lower() in [".mp4", ".webm"]:
                video_files.append(str(file))
        logger.info(f"Found {len(video_files)} videos")
        return sorted(video_files)
    except Exception as e:
        logger.error(f"Failed to scan {video_dir}: {str(e)}")
        return []

def prompt_user() -> tuple:
    """Prompt user for processing options."""
    logger.info(f"{Fore.MAGENTA}Starting media processing configuration...")
    
    while True:
        response = input(f"{Fore.CYAN}Generate thumbnails and WebM clips? (y/n): {Style.RESET_ALL}").strip().lower()
        if response in ['y', 'n']:
            generate_thumbs = response == 'y'
            break
        logger.warning("Invalid input, please enter 'y' or 'n'")

    while True:
        response = input(f"{Fore.CYAN}Generate GIFs? (y/n): {Style.RESET_ALL}").strip().lower()
        if response in ['y', 'n']:
            generate_gifs = response == 'y'
            break
        logger.warning("Invalid input, please enter 'y' or 'n'")

    while True:
        response = input(f"{Fore.CYAN}Generate tags? (y/n): {Style.RESET_ALL}").strip().lower()
        if response in ['y', 'n']:
            generate_tags = response == 'y'
            break
        logger.warning("Invalid input, please enter 'y' or 'n'")

    clear_cache = False
    if generate_thumbs or generate_gifs or generate_tags:
        while True:
            response = input(f"{Fore.YELLOW}Clear cache? (y/n): {Style.RESET_ALL}").strip().lower()
            if response in ['y', 'n']:
                clear_cache = response == 'y'
                break
            logger.warning("Invalid input")

    fps = 20
    if generate_thumbs:
        while True:
            try:
                response = input(f"{Fore.CYAN}Enter FPS for WebM clips (default 20): {Style.RESET_ALL}").strip()
                fps = int(response) if response else 20
                if fps > 0:
                    break
            except ValueError:
                logger.warning("Invalid input, please enter a number")

    resolution = "480:270"
    if generate_thumbs:
        while True:
            response = input(f"{Fore.CYAN}Enter resolution width (320–480, default 480): {Style.RESET_ALL}").strip()
            try:
                width = int(response) if response else 480
                if 320 <= width <= 480:
                    height = int(width * 9 / 16)
                    resolution = f"{width}:{height}"
                    break
            except ValueError:
                logger.warning("Invalid input")

    segment_length = 2
    if generate_thumbs:
        while True:
            try:
                response = input(f"{Fore.CYAN}Enter WebM segment length (1–20s, default 2): {Style.RESET_ALL}").strip()
                segment_length = int(response) if response else 2
                if 1 <= segment_length <= 20:
                    break
            except ValueError:
                logger.warning("Invalid input")

    num_tags = 15
    if generate_tags:
        while True:
            try:
                response = input(f"{Fore.CYAN}Enter number of tags (default 15): {Style.RESET_ALL}").strip()
                num_tags = int(response) if response else 15
                if num_tags > 0:
                    break
            except ValueError:
                logger.warning("Invalid input")

    logger.info(f"Config: Thumbs={generate_thumbs}, GIFs={generate_gifs}, Tags={generate_tags}, Clear Cache={clear_cache}, FPS={fps}, Resolution={resolution}, Segment Length={segment_length}s, Tags={num_tags}")
    return generate_thumbs, generate_gifs, generate_tags, clear_cache, fps, resolution, segment_length, num_tags

def process_media():
    """Generate thumbnails, WebM clips, GIFs, and tags."""
    start_time = time.time()
    logger.info(f"{Fore.MAGENTA}Starting media processing...")

    clean_abandoned_processes()
    generate_thumbs, generate_gifs, generate_tags, clear_cache, fps, resolution, segment_length, num_tags = prompt_user()

    tags_csv_path = get_path(TAGS_CSV)
    tags_csv_path.parent.mkdir(parents=True, exist_ok=True)

    video_files = get_video_files()
    total_videos = len(video_files)
    success_count = 0
    tags_data = load_existing_tags()
    existing_tag_ids = {entry["media_id"] for entry in tags_data}

    if clear_cache:
        logger.info("Clearing cache...")
        backup_dir = Path(f"backup/{time.strftime('%Y%m%d_%H%M%S')}")
        try:
            if get_path(THUMBS_DIR, "preview").exists():
                shutil.copytree(get_path(THUMBS_DIR, "preview"), backup_dir / "thumbnails")
                logger.info(f"Backed up thumbnails to {backup_dir}/thumbnails")
            if get_path(GIF_DIR).exists():
                shutil.copytree(get_path(GIF_DIR), backup_dir / "gifs")
                logger.info(f"Backed up GIFs to {backup_dir}/gifs")
            if tags_csv_path.exists():
                shutil.copy(tags_csv_path, backup_dir / "tags.csv")
                logger.info(f"Backed up tags to {backup_dir}/tags.csv")

            shutil.rmtree(get_path(THUMBS_DIR, "preview"), ignore_errors=True)
            shutil.rmtree(get_path(GIF_DIR), ignore_errors=True)
            if tags_csv_path.exists():
                tags_csv_path.unlink()
            get_path(THUMBS_DIR, "preview").mkdir(parents=True, exist_ok=True)
            get_path(GIF_DIR).mkdir(parents=True, exist_ok=True)
            tags_data = []
            existing_tag_ids = set()
            logger.log(logging.SUCCESS, "Cleared cache")
        except Exception as e:
            logger.error(f"Failed to clear cache: {e}")
            return

    tagger = None
    if generate_tags:
        try:
            tagger = pipeline("zero-shot-image-classification", model="openai/clip-vit-base-patch32")
            logger.log(logging.SUCCESS, "CLIP pipeline loaded")
        except Exception as e:
            logger.error(f"Failed to load CLIP: {e}")
            logger.warning("Continuing with empty tags")

    candidate_tags = load_candidate_tags()

    if (generate_thumbs or generate_gifs) and not clear_cache:
        clean_thumbnails_and_gifs(video_files)

    for i, video_path in enumerate(tqdm(video_files, desc="Processing videos"), 1):
        file_path = video_path
        video_id = Path(video_path).stem
        logger.info(f"{Fore.MAGENTA}Processing video {i}/{total_videos}: {video_path}")

        try:
            duration = get_video_duration(file_path)
            if duration < 5:
                logger.warning(f"Skipping {video_path}: Duration {duration:.2f}s < 5s")
                continue

            jpeg_url = ""
            webm_urls = []
            gif_url = ""
            jpeg_path = get_path(THUMBS_DIR, "preview", f"{video_id}_thumb.jpg")
            webm_base_path = get_path(THUMBS_DIR, "preview", f"{video_id}.webm")
            gif_path = get_path(GIF_DIR, f"{video_id}.gif")
            gif_media_id = f"gif_{video_id}"

            if generate_thumbs:
                if not jpeg_path.exists():
                    jpeg_url = generate_jpeg(file_path, video_id, duration, resolution)
                    if not jpeg_url:
                        logger.warning(f"Failed to generate JPEG for {video_id}")
                        continue
                else:
                    jpeg_url = f"{THUMBNAIL_URL_PREFIX}/preview/{video_id}_thumb.jpg"
                    logger.info(f"JPEG exists: {jpeg_path}")

                if not webm_base_path.exists():
                    webm_urls = generate_webm(file_path, video_id, duration, fps, resolution, segment_length)
                    if not webm_urls:
                        logger.warning(f"Failed to generate WebM for {video_id}")
                        continue
                else:
                    webm_urls = [f"{THUMBNAIL_URL_PREFIX}/preview/{video_id}.webm"]

            if generate_gifs and not gif_path.exists() and video_id not in [id.replace("gif_", "") for id in existing_tag_ids if id.startswith("gif_")]:
                gif_url = generate_gif(file_path, video_id, duration)
                if not gif_url:
                    logger.warning(f"Failed to generate GIF for {video_id}")
                    continue
                if generate_tags and tagger:
                    tags = tag_image(str(jpeg_path), tagger, candidate_tags, num_tags)
                    if tags:
                        tags_entry = {
                            "media_id": gif_media_id,
                            "media_type": "gif",
                            **{f"tag{i}": tag for i, tag in enumerate(tags, 1)}
                        }
                        append_tags(tags_csv_path, tags_entry)
                        tags_data.append(tags_entry)
                        existing_tag_ids.add(gif_media_id)
                    else:
                        logger.warning(f"No tags generated for GIF {gif_media_id}")
            elif gif_path.exists():
                logger.info(f"GIF exists: {gif_path}")

            if generate_tags and video_id not in existing_tag_ids and jpeg_url:
                tags = tagger(str(jpeg_path), candidate_tags) if tagger else []
                tags = [item['label'] for item in sorted(tags, key=lambda x: x['score'], reverse=True)[:num_tags]] if tags else []
                if tags:
                    tags_entry = {
                        "media_id": video_id,
                        "media_type": "video",
                        **{f"tag{i}": tag for i, tag in enumerate(tags, 1)}
                    }
                    append_tags(tags_csv_path, tags_entry)
                    tags_data.append(tags_entry)
                    existing_tag_ids.add(video_id)
                else:
                    logger.warning(f"No tags generated for video {video_id}")

            success_count += 1

        except Exception as e:
            logger.error(f"Error processing {video_id}: {e}")

    if generate_tags:
        tags_data = clean_orphaned_tags(tags_data, video_files)

    if tagger:
        tagger = None
        gc.collect()

    elapsed_time = time.time() - start_time
    logger.info(f"{Fore.MAGENTA}Processed {success_count}/{total_videos} videos in {elapsed_time:.2f}s")

if __name__ == "__main__":
    process_media()