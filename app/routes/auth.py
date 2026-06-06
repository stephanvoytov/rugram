import re

from flask import Blueprint, Response, flash, jsonify, redirect, render_template, request, url_for
from flask_login import current_user, login_required, login_user, logout_user

from app.forms import LoginForm, RegistrationForm
from app.limiter import limiter
from app.logger import log
from app.repositories.user_repository import UserRepository
from app.translations import _

auth_bp = Blueprint("auth", __name__, template_folder="../templates")


@auth_bp.route("/login", methods=["GET", "POST"])
@limiter.limit("10/minute", methods=["POST"])
def login() -> Response:
    form = LoginForm()
    if form.validate_on_submit():
        user = UserRepository.get_by_login(form.email_or_username.data)
        if not user or not user.check_password(form.password.data):
            flash(_("Invalid email/username or password"), "danger")
            return redirect(url_for("auth.login"))

        login_user(user, remember=form.remember.data)
        return redirect(url_for("main.index"))

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
    user = UserRepository.get_by_login(login_or_email)
    if not user or not user.check_password(password):
        return jsonify({"ok": False, "error": "Invalid login/email or password"}), 401
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
    if len(username) < 3 or len(username) > 20:
        return jsonify({"ok": False, "error": "Username must be 3-20 characters"}), 400
    if not re.match(r"^[a-z0-9_]+$", username):
        return jsonify(
            {"ok": False, "error": "Username can only contain a-z, 0-9, underscore"}
        ), 400
    if len(password) < 6:
        return jsonify({"ok": False, "error": "Password must be at least 6 characters"}), 400
    if UserRepository.username_exists(username) or UserRepository.email_exists(email):
        return jsonify({"ok": False, "error": _("This username is already taken")}), 409
    user = UserRepository.create_user(username, email)
    if not user:
        return jsonify({"ok": False, "error": "Ошибка при регистрации"}), 500
    user.set_password(password)
    try:
        UserRepository.commit()
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
    except Exception:
        UserRepository.rollback()
        return jsonify({"ok": False, "error": "Ошибка при регистрации"}), 500


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

        u_exists = UserRepository.username_exists(username)
        e_exists = UserRepository.email_exists(email)

        if u_exists or e_exists:
            if u_exists:
                flash(_("This username is already taken"), "danger")
            if e_exists:
                flash(_("This email is already registered"), "danger")
            return render_template("auth/register.html", form=form)

        user = UserRepository.create_user(username, email)
        if not user:
            flash(_("Registration failed. Please try again."), "danger")
            return render_template("auth/register.html", form=form)
        user.set_password(form.password.data)
        try:
            UserRepository.commit()
            log.info(
                "user_registered", user_id=user.id, username=user.username, ip=request.remote_addr
            )
            flash(_("Registration successful! You can now log in."), "success")
            return redirect(url_for("auth.login"))
        except Exception:
            UserRepository.rollback()
            flash(_("Registration failed. Please try again."), "danger")
    return render_template("auth/register.html", form=form)
