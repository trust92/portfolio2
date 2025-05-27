import logging
from colorama import init, Fore, Style

init(autoreset=True)  # Initialize colorama for cross-platform ANSI colors

# Custom logging formatter with color coding
class ColoredFormatter(logging.Formatter):
    def format(self, record):
        level = record.levelname
        msg = record.getMessage()
        if level == "ERROR":
            return f"{Fore.RED}{msg}{Style.RESET_ALL}"
        elif level == "WARNING":
            return f"{Fore.YELLOW}{msg}{Style.RESET_ALL}"
        elif level == "INFO":
            return f"{Fore.GREEN}{msg}{Style.RESET_ALL}"
        else:
            return f"{Fore.CYAN}{msg}{Style.RESET_ALL}"

# Configure logger
logger = logging.getLogger("ImageTagger")
logger.setLevel(logging.DEBUG)
handler = logging.StreamHandler()
handler.setFormatter(ColoredFormatter("%(levelname)s: %(message)s"))
logger.addHandler(handler)