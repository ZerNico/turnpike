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

RUN apk add --no-cache yt-dlp ffmpeg

RUN addgroup -S app && adduser -S app -G app
USER app

WORKDIR /app
COPY --from=build /app/app ./app

CMD ["./app"]
