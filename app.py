import os
import sys

# Ensure backend modules can be imported directly
backend_path = os.path.join(os.path.dirname(__file__), 'backend')
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

# Import the actual Flask app from the backend directory
from backend.app import app

if __name__ == "__main__":
    app.run()
