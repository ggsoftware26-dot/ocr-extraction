# VPS + Cloudflare R2 (~$6–12/mo)

One VPS runs API, worker, Redis, and Caddy (HTTPS). Files go to **Cloudflare R2**. Works on **DigitalOcean**, **Hetzner**, Vultr, Linode, etc. — same steps.

Expected cost: **~$6–12/mo** (VPS) + **Gemini usage** + **~$0 R2** at low volume.

## 1. Cloudflare R2

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) → **R2** → **Create bucket** (e.g. `ocr-extraction`).

2. On the **R2 overview** page (bucket list, not inside a bucket) → **Manage R2 API Tokens** → **Create API token**  
   - Permission: **Object Read & Write** on that bucket.  
   - Copy **Access Key ID** and **Secret Access Key** (S3-compatible — not the `cfat_` token).

3. **Account ID** is on the R2 overview page (right column).

4. S3 endpoint for `.env`:

   ```
   https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   ```

## 2. VPS provider

### DigitalOcean (recommended)

1. Create a **Basic Droplet**: Ubuntu 24.04, **$6/mo** (1 GB) or **$12/mo** (2 GB) — prefer 2 GB for worker + Redis headroom.

2. Add your SSH key; note the **IPv4**.

3. **Networking → Firewalls** (or Droplet firewall): allow inbound **22**, **80**, **443**.

4. DNS: **A record** → Droplet IP (e.g. `ocr.example.com` → `1.2.3.4`).

### Hetzner (alternative)

Same flow: **CX22** (~€6/mo), Ubuntu 24.04, open **22/80/443**, A record to server IP.

### Any other VPS

Ubuntu 24.04+, 1–2 GB RAM minimum, ports **22**, **80**, **443** open, public IPv4.

## 3. SSH (from your laptop)

Repo-local SSH config (gitignored — copy from example on a new machine):

```bash
cp deploy/vps/ssh.config.example deploy/vps/ssh.config
# Set HostName and an absolute IdentityFile path in deploy/vps/ssh.config

chmod 600 keys/digital-ocean-ggsoftware26
ssh -F deploy/vps/ssh.config ocr-droplet
```

**Quick connect without config file:**

```bash
chmod 600 keys/digital-ocean-ggsoftware26
ssh -i keys/digital-ocean-ggsoftware26 root@YOUR_DROPLET_IP
```

## 4. Server setup

SSH in and install Docker:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# log out and back in
```

Clone and configure:

```bash
git clone <your-repo-url> ocr-extraction
cd ocr-extraction
cp deploy/vps/.env.example .env
nano .env   # DOMAIN, GEMINI_API_KEY, R2 keys, S3_ENDPOINT, S3_BUCKET
```

| Variable | Example |
| --- | --- |
| `DOMAIN` | `ocr.example.com` |
| `S3_ENDPOINT` | `https://abc123.r2.cloudflarestorage.com` |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | R2 S3 credentials |
| `S3_BUCKET` | `ocr-extraction` |
| `GEMINI_API_KEY` | Google AI Studio |

## 5. Deploy

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f api worker caddy
```

Verify:

```bash
curl https://ocr.example.com/health
curl -X POST https://ocr.example.com/v1/jobs -F "file=@./samples/sample2.jpeg"
```

## 6. Releases

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

## 7. Optional tuning

- **More throughput:** `docker compose -f docker-compose.prod.yml up -d --scale worker=2` (needs ~2 GB+ RAM).
- **Lower Gemini cost:** reduce `WORKER_CONCURRENCY` in `.env`.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Caddy won't get certificate | `DOMAIN` DNS → this server; ports 80/443 open |
| S3 / R2 SSL / worker restart loop | `S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com` (no bucket path, no trailing slash); `S3_REGION=us-east-1`; use R2 **Access Key** + **Secret** (not `cfat_` token) |
| S3 / R2 errors | Bucket exists in Cloudflare dashboard |
| Worker can't reach Gemini | Outbound HTTPS (443) allowed |
| Upload too large | `MAX_FILE_BYTES` and Caddy `max_size` (default 50 MB) |
| Ingest `EACCES` on `./data/imap-processed.json` | Rebuild/redeploy — ingest entrypoint fixes volume ownership on start. Manual fix: `docker compose -f docker-compose.prod.yml exec -u root ingest chown -R node:node /app/data` |
| Ingest email `Connection timeout` | VPS often blocks SMTP port 587. Set `SMTP_PORT=465` and `SMTP_SECURE=true` in `.env`, redeploy ingest. Test: `docker compose -f docker-compose.prod.yml exec ingest nc -zv smtp.gmail.com 465` |
