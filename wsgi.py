"""WSGI entry point for production servers (gunicorn, PythonAnywhere, etc.)"""
import os
import sys

# Добавляем корень проекта в путь
sys.path.insert(0, os.path.dirname(__file__))

from app import create_app

app = create_app()
application = app  # PythonAnywhere expects 'application'
