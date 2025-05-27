"""
Centralized logging utility for consistent, color-coded logging across applications.
Provides debug, info, warning, error, and success levels with Nerd Font icons.
Outputs to console (with ANSI colors and icons) and file (media_processing.log).
Handles file operation errors and logs absolute paths for debugging.

@module lib/logging
"""

import logging
from pathlib import Path
from colorama import init, Fore, Style

# Initialize colorama for cross-platform color support
init(autoreset=True)

# Custom logging level for success
logging.SUCCESS = 25
logging.addLevelName(logging.SUCCESS, "SUCCESS")

def success(self, message, *args, **kwargs):
    """Log a success message at SUCCESS level."""
    if self.isEnabledFor(logging.SUCCESS):
        self._log(logging.SUCCESS, message, args, **kwargs)

logging.Logger.success = success

# Custom formatter with Nerd Font icons and color
class ColoredFormatter(logging.Formatter):
    ICONS = {
        'DEBUG': 'ℹ ',
        'INFO': 'ℹ ',
        'WARNING': '⚠ ',
        'ERROR': '✗ ',
        'SUCCESS': '✔ ',
    }
    COLORS = {
        'DEBUG': Fore.CYAN,
        'INFO': Fore.CYAN,
        'WARNING': Fore.YELLOW,
        'ERROR': Fore.RED,
        'SUCCESS': Fore.GREEN,
    }

    def format(self, record):
        icon = self.ICONS.get(record.levelname, 'ℹ ')
        color = self.COLORS.get(record.levelname, Fore.CYAN)
        log_message = super().format(record)
        return f"{color}{icon}{log_message}{Style.RESET_ALL}"

def setup_logger(name: str, log_file: str = 'media_processing.log') -> logging.Logger:
    """
    Set up a logger with file and console handlers, including error handling and absolute path logging.

    Args:
        name: Logger name (e.g., __name__).
        log_file: Relative path to the log file (default: 'media_processing.log').

    Returns:
        Configured logger instance.

    Raises:
        OSError: If log file cannot be created or written to.
    """
    logger = logging.getLogger(name)
    logger.setLevel(logging.DEBUG)

    # Resolve absolute path for debugging
    try:
        log_path = Path(log_file).resolve()
        logger.debug(f"ℹ DEBUG: Resolved log file path {log_file} to {log_path}")
    except OSError as e:
        logger.error(f"✗ Failed to resolve log file path {log_file}: {str(e)}")
        raise

    # File handler
    try:
        file_handler = logging.FileHandler(log_path)
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(logging.Formatter(
            '%(asctime)s [%(levelname)s] %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        ))
    except OSError as e:
        logger.error(f"✗ Failed to create log file at {log_path}: {str(e)}")
        raise

    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.DEBUG)
    console_handler.setFormatter(ColoredFormatter(
        '%(asctime)s [%(levelname)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    ))

    # Avoid duplicate handlers
    logger.handlers.clear()
    logger.addHandler(file_handler)6
    logger.addHandler(console_handler)

    return logger