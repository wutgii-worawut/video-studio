# Headless render worker for Cloud Run Jobs, AWS Batch or an on-prem VM.
# The base contains the Playwright-matched Chromium runtime.
FROM mcr.microsoft.com/playwright:v1.63.0-noble
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
ENV VIDEO_STUDIO_BROWSER=chromium
ENV NODE_ENV=production
# Override CMD with: node render.mjs <project> video 8 2
CMD ["node", "batch.mjs", "examples/batch-smoke.json", "--concurrency=1"]
