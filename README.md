# OCR Extraction Service

NestJS service that accepts images or PDFs, runs open-ended OCR extraction with Gemini 2.5 Flash, and returns JSON fields (`key`, `value`, `description`) plus tables.

HTTP stays fast: upload stores the file and enqueues a job. Workers talk to Gemini and you poll (or receive a webhook) for the result.

## Prerequisites

- Node.js 22+
- Docker (Redis + MinIO)
- A `GEMINI_API_KEY`

## Local setup

```bash
cp .env.example .env
# set API_KEY and GEMINI_API_KEY in .env

docker compose up -d
npm install
```

Run the API and worker in two terminals:

```bash
npm run start:dev
npm run start:worker:dev
```

- API: http://localhost:3000
- MinIO console: http://localhost:9001 (`minioadmin` / `minioadmin`)

## API

**Submit a document**

```bash
curl -X POST http://localhost:3000/v1/jobs \
  -H "Authorization: Bearer $API_KEY" \
  -F "file=@./sample.pdf" \
  -F "webhook_url=https://example.com/ocr-hook"
```

Response:

```json
{ "job_id": "uuid", "status": "queued", "result": null, "error": null }
```

**Poll**

```bash
curl http://localhost:3000/v1/jobs/<job_id> \
  -H "Authorization: Bearer $API_KEY"
```

Statuses: `queued` | `processing` | `completed` | `failed`.

Completed payload includes `document_type`, `summary`, `fields[]`, and `tables[]`.

Optional `webhook_url` receives the same JSON when the job finishes (or finally fails).

**Health**

```bash
curl http://localhost:3000/health
```

## Production (VPS + Cloudflare R2, ~$6–12/mo)

Single VPS (DigitalOcean, Hetzner, etc.) with Docker Compose (API + worker + Redis + Caddy) and R2 for file storage. See `deploy/vps/README.md`.

```bash
cp deploy/vps/.env.example .env
docker compose -f docker-compose.prod.yml up -d --build
```

## Scale

- Scale the API process horizontally (stateless).
- Scale `start:worker` replicas against the same Redis queue.
- Cap Gemini load with `WORKER_CONCURRENCY` (jobs per worker) and `PDF_BATCH_CONCURRENCY` (page batches inside a large PDF).
- PDFs with more than `PDF_PAGE_THRESHOLD` pages are split into `PDF_PAGE_BATCH_SIZE` batches.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run start:dev` | API with watch |
| `npm run start:worker:dev` | Worker with watch |
| `npm run start:prod` | API from `dist/` |
| `npm run start:worker:prod` | Worker from `dist/` |
| `npm test` | Unit tests |
