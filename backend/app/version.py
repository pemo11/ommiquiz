"""
Version management for OmmiQuiz backend
Reads version from root version.json file
"""
import os
import json
from pathlib import Path

def get_version():
    """Read version from version.json at project root"""
    try:
        # Get the root directory (3 levels up from this file: app/version.py -> backend/ -> root/)
        root_dir = Path(__file__).parent.parent.parent
        version_file = root_dir / "version.json"
        
        if version_file.exists():
            with open(version_file, 'r') as f:
                data = json.load(f)
                return data.get("version") or data.get("backend") or "1.0.0"
    except Exception as e:
        print(f"Warning: Could not read version.json: {e}")
    
    # Fallback to environment variable or default
    return os.getenv("APP_VERSION", "1.0.0")

# Export version as constant
APP_VERSION = get_version()
