from app.routes.auth import auth_bp
from app.routes.posts import posts_bp
from app.routes.main import main_bp
from app.routes.admin import admin_bp

__all__ = ['auth_bp', 'posts_bp', 'main_bp', 'admin_bp']
