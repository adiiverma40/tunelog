FROM python:3.14.3-alpine AS builder

RUN apk add --no-cache \
    build-base \
    libffi-dev

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --target=/app/deps -r requirements.txt

FROM python:3.14.3-alpine

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/deps

WORKDIR /app
COPY --from=builder /app/deps /app/deps
COPY . .

CMD ["python", "main.py"]