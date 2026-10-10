# Cloud Render Worker Deployment

## Overview

`cloud/job.mjs` is a single composition job executable. It validates the requested project, calls the existing Video Studio Render Pipeline, validates the produced MP4, and can upload it using a short-lived pre-signed HTTPS `PUT` URL. This is **cloud-ready code**, not a deployed account service.

## Container local test

```powershell
cd D:\my_project\video-studio
docker build -t video-studio-worker .
docker run --rm --env VS_PROJECT=composition-demo --env VS_BLUR=1 --env VS_WORKERS=2 --volume "${PWD}/projects:/app/projects" video-studio-worker node cloud/job.mjs
```

Container needs a writable `projects/<name>/output` path; mount a persistent volume or pre-signed HTTPS upload destination in the real cloud job. Dockerfile pins Playwright 1.63.0 and uses bundled Chromium via `VIDEO_STUDIO_BROWSER=chromium`.

## Job parameters

| Variable | Purpose | Default |
|---|---|---|
| `VS_PROJECT` | Project folder name (required) | None |
| `VS_BLUR` | Subframes per frame | `8` |
| `VS_WORKERS` | Chrome workers | `2` |
| `VS_UPLOAD_URL` | Signed HTTPS PUT destination for MP4; optional | None |
| `VS_UPLOAD_CONTENT_TYPE` | MIME signed with upload URL | `video/mp4` |
| `VIDEO_STUDIO_BROWSER` | `chromium` in Docker, `chrome` on desktop | Container configured |

## AWS Batch / Google Cloud Run Jobs

Deploy the container as a job (not a continuously exposed browser app), pass the variables above, and configure enough CPU/RAM/temp disk for the desired clips. For artifacts, provide a private signed URL or persistent mounted volume. Never bake cloud credentials or presigned URLs into the image. Limit cloud job concurrency per project/output destination; each isolated job container has only a **local** lock, not a distributed lock. The same output target should not be used by two concurrent remote jobs.

## What is verified

- Local `cloud/job.mjs` executes real `composition-demo` render successfully with `VS_PROJECT=composition-demo` and returns `uploaded:false`
- Local FFmpeg + Chromium/Chrome render pipeline has test coverage
- **Docker image build not verified**: Docker CLI installed but daemon unavailable during this session
- **AWS/GCP deployment and signed HTTPS upload not verified**: no target account or signed endpoint connected

## Operational security

- Do not expose `studio.mjs` over the internet. It binds only to 127.0.0.1 and edits local project JSON
- Only use `VS_UPLOAD_URL` with HTTPS signed URLs and short expiry. The URL is a secret
- Keep outputs separated by run ID or job-specific signed URL on the cloud; use immutable object paths
- Test output playback, duration and audio after remote upload before considering the delivery complete
