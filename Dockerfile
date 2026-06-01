FROM python:3.12-slim

WORKDIR /app

# Системные зависимости для Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    libjpeg62-turbo \
    zlib1g \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Директории для данных (примонтировать volume)
RUN mkdir -p instance app/static/uploads/posts app/static/uploads/profile_images

EXPOSE 8000

CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:8000", "wsgi:app"]
