"""Auth service — business logic for authentication and registration.

Extracted from app/routes/auth.py. Does NOT import Flask, forms, or limiter.
Uses UserRepository for all data access, raises ServiceError / NotFoundError.
"""

import re

from app.logger import log
from app.repositories.user_repository import UserRepository
from app.services.base import ServiceError


class AuthService:
    """Business logic for login and registration."""

    @staticmethod
    def authenticate(login_or_email: str, password: str):
        """Validate credentials and return the user.

        Raises:
            ServiceError: if credentials are invalid.
        """
        user = UserRepository.get_by_login(login_or_email)
        if not user or not user.check_password(password):
            raise ServiceError("Invalid email/username or password")
        return user

    @staticmethod
    def register_user(username: str, email: str, password: str):
        """Register a new user with validation.

        Validates username length/chars, password length, uniqueness.
        Creates user, sets password, commits, returns the user.

        Raises:
            ServiceError: on validation failure, duplicate, or commit failure.
        """
        username = username.lower()

        # Validation
        if len(username) < 3 or len(username) > 20:
            raise ServiceError("Username must be 3-20 characters")
        if not re.match(r"^[a-z0-9_]+$", username):
            raise ServiceError("Username can only contain a-z, 0-9, underscore")
        if len(password) < 6:
            raise ServiceError("Password must be at least 6 characters")

        # Uniqueness checks
        u_exists = UserRepository.username_exists(username)
        e_exists = UserRepository.email_exists(email)

        if u_exists:
            raise ServiceError("This username is already taken")
        if e_exists:
            raise ServiceError("This email is already registered")

        # Create user
        user = UserRepository.create_user(username, email)
        if not user:
            raise ServiceError("Registration failed. Please try again.")
        user.set_password(password)

        try:
            UserRepository.commit()
            log.info("user_registered", user_id=user.id, username=user.username)
            return user
        except Exception:
            UserRepository.rollback()
            raise ServiceError("Registration failed. Please try again.") from None
