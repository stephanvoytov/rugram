FROM python:3.12-slim

# Установка uv (быстрая замена pip)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Системные зависимости для Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    libjpeg62-turbo \
    zlib1g \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN uv pip install --system --no-cache -r requirements.txt

COPY . .

# Директории для данных создаются в start.sh (примонтировать volume)

# Создаём непривилегированного пользователя
RUN addgroup --system rugram && adduser --system --ingroup rugram --uid 1000 rugram && chown -R rugram:rugram /app

RUN chmod +x start.sh

EXPOSE 8000

USER rugram

CMD ["./start.sh"]
