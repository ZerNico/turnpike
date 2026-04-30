# Stage 1: Install dependencies
FROM oven/bun:1-alpine AS deps

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Stage 2: Build a single executable
FROM oven/bun:1-alpine AS build

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY src/ src/
COPY tsconfig.json ./
RUN bun build --compile --minify \
    --external ffmpeg-static \
    --external opusscript \
    --external @discordjs/opus \
    src/index.ts --outfile app

# Stage 3: Minimal production image
FROM alpine:3.23

RUN apk add --no-cache ffmpeg python3 ca-certificates wget

RUN addgroup -S app && adduser -S app -G app

WORKDIR /app
COPY --from=build /app/app ./app

RUN mkdir -p /app/bin /app/data \
    && wget -qO /app/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    && chmod +x /app/bin/yt-dlp \
    && chown -R app:app /app/bin /app/data

ENV PATH="/app/bin:${PATH}"

COPY --chown=app:app docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

USER app

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["./app"]
