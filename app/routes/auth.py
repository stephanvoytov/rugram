from flask import Blueprint, Response, flash, jsonify, redirect, render_template, request, url_for
from flask_login import current_user, login_required, login_user, logout_user

from app.forms import LoginForm, RegistrationForm
from app.limiter import limiter
from app.logger import log
from app.services import AuthService
from app.services.base import ServiceError
from app.translations import _

auth_bp = Blueprint("auth", __name__, template_folder="../templates")


@auth_bp.route("/login", methods=["GET", "POST"])
@limiter.limit("10/minute", methods=["POST"])
def login() -> Response:
    form = LoginForm()
    if form.validate_on_submit():
        try:
            user = AuthService.authenticate(form.email_or_username.data, form.password.data)
            login_user(user, remember=form.remember.data)
            return redirect(url_for("main.index"))
        except ServiceError:
            flash(_("Invalid email/username or password"), "danger")
            return redirect(url_for("auth.login"))

    return render_template("auth/login.html", form=form)


@auth_bp.route("/logout")
@login_required
def logout() -> Response:
    logout_user()
    flash(_("Logged out"), "info")
    return redirect(url_for("main.index"))


# -- JSON API для терминала --
@auth_bp.route("/auth/api/login", methods=["POST"])
@limiter.limit("10/minute")
def api_login() -> Response:
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"ok": False, "error": "Expected JSON body"}), 400
    login_or_email = (data.get("login") or data.get("email") or "").strip()
    password = (data.get("password") or "").strip()
    if not login_or_email or not password:
        return jsonify({"ok": False, "error": "login/email and password required"}), 400
    try:
        user = AuthService.authenticate(login_or_email, password)
        login_user(user)
        return jsonify(
            {
                "ok": True,
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "profile_image": user.profile_image,
                    "description": user.description or "",
                },
            }
        )
    except ServiceError as e:
        return jsonify({"ok": False, "error": e.message}), 401


@auth_bp.route("/auth/api/register", methods=["POST"])
@limiter.limit("5/minute")
def api_register() -> Response:
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"ok": False, "error": "Expected JSON body"}), 400
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip()
    password = (data.get("password") or "").strip()
    if not username or not email or not password:
        return jsonify({"ok": False, "error": "username, email and password required"}), 400
    try:
        user = AuthService.register_user(username, email, password)
        login_user(user)
        return jsonify(
            {
                "ok": True,
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                },
            }
        ), 201
    except ServiceError as e:
        return jsonify({"ok": False, "error": e.message}), (
            409 if "taken" in e.message or "registered" in e.message else 400
        )


@auth_bp.route("/auth/api/logout", methods=["POST"])
def api_logout() -> Response:
    logout_user()
    return jsonify({"ok": True, "message": "Вышли из системы"})


@auth_bp.route("/auth/api/me")
def api_me() -> Response:
    if not current_user.is_authenticated:
        return jsonify({"ok": False, "authenticated": False}), 401
    return jsonify(
        {
            "ok": True,
            "authenticated": True,
            "user": {
                "id": current_user.id,
                "username": current_user.username,
                "email": current_user.email,
                "profile_image": current_user.profile_image,
                "description": current_user.description or "",
            },
        }
    )


@auth_bp.route("/register", methods=["GET", "POST"])
@limiter.limit("5/minute", methods=["POST"])
def register() -> Response:
    form = RegistrationForm()
    if form.validate_on_submit():
        username = form.username.data.lower()
        email = form.email.data

        try:
            user = AuthService.register_user(username, email, form.password.data)
            log.info(
                "user_registered", user_id=user.id, username=user.username, ip=request.remote_addr
            )
            flash(_("Registration successful! You can now log in."), "success")
            return redirect(url_for("auth.login"))
        except ServiceError as e:
            flash(_(e.message), "danger")

    return render_template("auth/register.html", form=form)
