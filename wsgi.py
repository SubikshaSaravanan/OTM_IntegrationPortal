import sys
import os

# Add project root to path so 'backend' is treated as a package
sys.path.insert(0, os.path.dirname(__file__))

from backend.app import app

if __name__ == "__main__":
    app.run()
