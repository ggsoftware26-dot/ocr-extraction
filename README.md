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

Optional: run the IMAP ingest service (IDLE mailbox → OCR API → webhook):

```bash
npm run start:ingest:dev
```

Set `IMAP_ENABLED=false` to run ingest webhooks only (no mailbox IDLE).

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

## IMAP ingest (Gmail and other mailboxes)

The ingest process keeps a persistent IMAP IDLE connection, processes unseen messages as they arrive, filters invoice-like emails, submits attachments to the OCR API over HTTP, and emails the full OCR result back to the same mailbox when processing completes.

```bash
# .env — see .env.example for all IMAP_* variables
npm run start:ingest:dev   # http://localhost:3001
```

Flow:

1. IMAP IDLE wakes on new mail (and once on connect) for unseen messages matching `IMAP_FILTER_SUBJECT` / `IMAP_FILTER_FROM`
2. PDF/image attachments are POSTed to `POST /v1/jobs` with `webhook_url=http://localhost:3001/webhooks/ocr`
3. OCR worker completes and POSTs the result back to ingest
4. Ingest logs the summary, persists state in `IMAP_PROCESSED_STORE_PATH`, and emails the full JSON result to `INGEST_NOTIFY_EMAIL` (defaults to `IMAP_USER`) via Gmail SMTP

Inspect processed records:

```bash
curl http://localhost:3001/records
curl http://localhost:3001/health
```

### Connect Gmail via IMAP

1. In Gmail: **Settings → See all settings → Forwarding and POP/IMAP → Enable IMAP**
2. On your Google account: enable **2-Step Verification**
3. Create an **App Password**: Google Account → Security → 2-Step Verification → App passwords → Mail
4. Set in `.env`:

```env
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=your@gmail.com
IMAP_PASSWORD=your-16-char-app-password
IMAP_FILTER_SUBJECT=invoice,receipt
OCR_API_URL=http://localhost:3000
OCR_API_KEY=<same as API_KEY>
INGEST_PUBLIC_URL=http://localhost:3001
```

5. Run API, worker, and ingest (three terminals)
6. Send yourself a test email with a PDF invoice attachment whose subject contains "invoice" or "receipt"
7. Check ingest logs and `curl http://localhost:3001/records`

**Note:** Use the app password, not your regular Gmail password. In Docker prod, set `INGEST_PUBLIC_URL=http://ingest:3001` so the OCR worker can reach the ingest webhook on the internal network.

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
| `npm run start:ingest:dev` | IMAP ingest with watch |
| `npm run start:ingest:prod` | Ingest from `dist/` |
| `npm test` | Unit tests |
