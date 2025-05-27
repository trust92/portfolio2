import os
import pathlib
from dotenv import load_dotenv

load_dotenv()

# Define project root directory
ROOT_DIR = pathlib.Path(os.getenv("PROJECT_ROOT", pathlib.Path(__file__).parent.parent))

def get_root_relative_path(*path_segments):
    """Construct a path relative to the project root."""
    try:
        return os.path.join(ROOT_DIR, *path_segments)
    except TypeError as e:
        from logger import logger
        logger.error(f"Invalid path segments: {path_segments}. Error: {str(e)}")
        raise