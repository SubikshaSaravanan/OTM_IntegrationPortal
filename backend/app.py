from flask import Flask
from flask_cors import CORS
import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # On Render, env vars are set directly — dotenv not needed

from database import db, migrate
from config import Config

# ✅ SINGLE SOURCE OF TRUTH FOR INVOICES
from routes import bp
from auth import auth_bp
from item_modules.item_routes import item_bp
from invoice_upload_routes import invoice_upload_routes
from tracking_routes import tracking_bp


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # Disable alphabetical sorting of JSON keys to preserve OTM field order
    app.json.sort_keys = False

    # Enable CORS
    CORS(app)

    # Init DB & migrations
    db.init_app(app)
    migrate.init_app(app, db)

    # Register Blueprints
    app.register_blueprint(bp, url_prefix="/api")
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(item_bp, url_prefix="/api/items")
    app.register_blueprint(invoice_upload_routes, url_prefix="/api")
    app.register_blueprint(tracking_bp, url_prefix="/api/tracking")

    # Auto-create all tables on first run (ensures users, invoices, etc. exist in production)
    with app.app_context():
        import models  # noqa: F401 — ensure all models are registered
        from item_modules.item_model import FieldConfig, Template  # noqa: F401
        db.create_all()

    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True, port=5000)
