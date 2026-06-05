import os
import time

from flask import Flask, request, jsonify, redirect, url_for, session, render_template
from flask_login import LoginManager
from flask_restful import Api
from werkzeug.middleware.proxy_fix import ProxyFix

from app.models import User
from app.filters import filters_bp
from app.resources import post_resources
from app.routes import main_bp, auth_bp, posts_bp, admin_bp
from app.routes.helpers import log_system_event
from app.translations import _
from app.limiter import limiter
from extensions import db, csrf
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

    # Trust X-Forwarded-Proto/X-For from reverse proxy (Caddy)
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)

    csrf.init_app(app)

    db.init_app(app)

    login_manager.init_app(app)

    limiter.init_app(app)

    # Директория instance должна существовать до db.create_all(),
    # иначе SQLite не сможет создать файл БД
    instance_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'instance')
    ensure_dirs([
        instance_dir,
        os.path.join(Config.UPLOAD_FOLDER, 'posts'),
        os.path.join(Config.UPLOAD_FOLDER, 'profile_images'),
        Config.CHAT_UPLOAD_FOLDER,
    ])

    with app.app_context():
        db.create_all()

    app.register_blueprint(main_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(posts_bp)
    app.register_blueprint(filters_bp)
    app.register_blueprint(admin_bp)

    # Версия для сброса кеша статики (на основе mtime файлов)
    static_dir = os.path.join(app.root_path, 'static')
    static_files = [
        os.path.join(static_dir, 'css', 'style.css'),
        os.path.join(static_dir, 'js', 'main.js'),
        os.path.join(static_dir, 'js', 'terminal.js'),
        os.path.join(static_dir, 'sw.js'),
    ]
    max_mtime = max(
        (os.path.getmtime(f) for f in static_files if os.path.exists(f)),
        default=time.time()
    )
    static_version = str(int(max_mtime))

    # Service Worker на корневом scope (не /static/)
    @app.route('/sw.js')
    def service_worker():
        resp = app.send_static_file('sw.js')
        resp.headers['Service-Worker-Allowed'] = '/'
        resp.headers['Cache-Control'] = 'no-cache'
        return resp

    @app.before_request
    def detect_lang():
        lang = request.args.get('lang')
        if lang in ('en', 'ru'):
            session['lang'] = lang
        elif 'lang' not in session:
            session['lang'] = 'en'

    @app.after_request
    def add_security_headers(resp):
        resp.headers['X-Content-Type-Options'] = 'nosniff'
        resp.headers['X-Frame-Options'] = 'SAMEORIGIN'
        resp.headers['Referrer-Policy'] = 'same-origin'
        resp.headers['Content-Security-Policy'] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data:; "
            "connect-src 'self'; "
            "frame-src 'none'; "
            "base-uri 'self'"
        )
        if request.is_secure:
            resp.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
        return resp

    @app.context_processor
    def inject_globals():
        return {
            'static_version': static_version,
            'vapid_public_key': app.config.get('VAPID_PUBLIC_KEY', ''),
            '_': _,
            'current_lang': session.get('lang', 'en'),
        }

    # ── Error handlers ──
    ERROR_MESSAGES = {
        400: 'Bad request syntax or unsupported method',
        403: 'You do not have permission to access this resource',
        404: 'The page you are looking for does not exist',
        405: 'Method not allowed for this endpoint',
        413: 'Request entity too large',
        429: 'Too many requests — slow down',
        500: 'Internal server error — something went wrong on our end',
        502: 'Bad gateway — upstream server returned invalid response',
        503: 'Service temporarily unavailable — try again later',
    }
    ERROR_NAMES = {
        400: 'Bad Request',
        403: 'Forbidden',
        404: 'Not Found',
        405: 'Method Not Allowed',
        413: 'Payload Too Large',
        429: 'Too Many Requests',
        500: 'Internal Server Error',
        502: 'Bad Gateway',
        503: 'Service Unavailable',
    }

    for code in ERROR_MESSAGES:
        @app.errorhandler(code)
        def handle_error(e, code=code):
            # Log 500+ errors to system events
            if code >= 500:
                import traceback
                log_system_event(
                    level='error' if code != 503 else 'warning',
                    category='system',
                    message=f'HTTP {code}: {ERROR_MESSAGES[code]}',
                    details=traceback.format_exc() if hasattr(e, '__traceback__') and e.__traceback__ else None
                )
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return jsonify({'error': ERROR_MESSAGES[code]}), code
            return render_template(
                'errors/error.html',
                code=code,
                name=ERROR_NAMES.get(code, 'Error'),
                message=e.description if hasattr(e, 'description') and e.description else ERROR_MESSAGES[code],
            ), code

    return app


@login_manager.user_loader
def load_user(user_id):
    return User.query.get(user_id)
