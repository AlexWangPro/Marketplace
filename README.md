# Wall Printer Exchange v3.8.5

Railway-ready Node/Express/PostgreSQL application for reviewed used wall printer listings.

## What is new in v3.8.5

This is a hotfix on top of v3.8.4.

- Removes the public-facing admin configuration hint from the login page.
- Makes admin login more reliable by checking `ADMIN_EMAIL` and `ADMIN_PASSWORD` directly from Railway web service variables before falling back to the database password hash.
- Keeps the database admin user synced on deploy, but no longer depends only on the stored hash for current Railway credentials.
- Accepts trimmed credentials and quoted Railway variable values to avoid login failures caused by accidental spaces or copied quotes.
- Keeps the v3.8.4 admin delete and required listing submission improvements.
- Keeps browser-language auto-detection and language cookie behavior from v3.8.3.

## Required Railway variables

Set these on the web service, not the Postgres service:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
SESSION_SECRET=replace-with-a-long-random-secret
ADMIN_EMAIL=your-admin-email@example.com
ADMIN_PASSWORD=your-strong-password
APP_URL=https://www.wallprinter.org
NODE_ENV=production
RESEND_API_KEY=re_xxxxxxxxx
MAIL_FROM=Wall Printer Exchange <noreply@wallprinter.org>
```

After changing `ADMIN_EMAIL` or `ADMIN_PASSWORD`, redeploy the web service.

## Health check

`/healthz` returns version `3.8.5`.

```json
{"ok":true,"service":"wall-printer-exchange","version":"3.8.5"}
```

## Deploy

1. Replace the repository contents with this package.
2. Commit and push.
3. In Railway, redeploy the web service without cache.
4. Check `/healthz`.
5. Log in at `/admin/login` using the current Railway `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
