import os

from flask import Flask, request, jsonify, redirect, url_for
from flask_login import LoginManager
from flask_restful import Api
from flask_wtf import CSRFProtect

from app.models import User
from app.filters import filters_bp
from app.resources import post_resources
from app.routes import posts_bp
from extensions import db
from config import Config


def ensure_dirs(paths):
    """Создаёт директории, если их нет."""
    for path in paths:
        os.makedirs(path, exist_ok=True)

login_manager = LoginManager()
login_manager.login_view = 'auth.login'
login_manager.login_message = 'Для доступа к этой странице необходимо войти в систему'
login_manager.login_message_category = 'info'


@login_manager.unauthorized_handler
def unauthorized():
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return jsonify({'error': 'Unauthorized'}), 401
    return redirect(url_for('auth.login', next=request.url))


def create_app():
    app = Flask(__name__)
    api = Api(app)
    api.add_resource(post_resources.PostListResource, '/api/v1/posts')
    api.add_resource(post_resources.PostResource, '/api/v1/posts/<int:post_id>')
    app.config.from_object(Config)

    csrf = CSRFProtect(app)

    @app.before_request
    def csrf_exempt_api():
        if request.path.startswith('/api/'):
            request._csrf_exempt = True

    db.init_app(app)

    login_manager.init_app(app)

    with app.app_context():
        db.create_all()

    # Создаём необходимые директории
    ensure_dirs([
        os.path.join(Config.UPLOAD_FOLDER, 'posts'),
        os.path.join(Config.UPLOAD_FOLDER, 'profile_images'),
        os.path.join(app.instance_path),
        # Директория instance в корне проекта (там лежит SQLite)
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'instance'),
    ])

    from app.routes import main_bp, auth_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(posts_bp)
    app.register_blueprint(filters_bp)

    return app


@login_manager.user_loader
def load_user(user_id):
    return User.query.get(user_id)
