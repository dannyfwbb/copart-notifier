# Docker Setup for Copart Notifier

This document provides instructions for running the Copart Notifier application using Docker.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)

## Configuration

1. Create a `.env` file in the root directory with your Telegram bot token:

```
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
```

## Building and Running

### Using Docker Compose (Recommended)

1. Build and start the application:

```bash
docker-compose up -d
```

2. View logs:

```bash
docker-compose logs -f
```

3. Stop the application:

```bash
docker-compose down
```

### Using Docker Directly

1. Build the Docker image:

```bash
docker build -t copart-notifier .
```

2. Run the container:

```bash
docker run -d \
  --name copart-notifier \
  -p 3000:3000 \
  -e TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here \
  -v $(pwd)/copart-notifier.sqlite:/app/copart-notifier.sqlite \
  copart-notifier
```

## Data Persistence

The SQLite database file is mounted as a volume to ensure data persistence between container restarts. The database file is stored at:

```
./copart-notifier.sqlite
```

## Health Check

The application includes a health check that verifies the API is responding. You can manually check the health status with:

```bash
docker inspect --format='{{json .State.Health}}' copart-notifier
```

## Troubleshooting

If you encounter issues:

1. Check the container logs:

```bash
docker logs copart-notifier
```

2. Ensure your Telegram bot token is correctly set in the `.env` file.

3. Verify the container is running:

```bash
docker ps
```

4. If the container exits immediately, check for errors in the build process:

```bash
docker-compose build --no-cache
```
