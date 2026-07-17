# Wall Printer Exchange v3.8

Railway Node/Express version for Wall Printer Exchange.

## What is new in v3.8

- 10-language public UI, excluding Chinese:
  - English `/`
  - Japanese `/ja/`
  - Korean `/ko/`
  - German `/de/`
  - French `/fr/`
  - Spanish `/es/`
  - Italian `/it/`
  - Portuguese `/pt/`
  - Russian `/ru/`
  - Arabic `/ar/`
- Locale JSON files in `locales/`.
- Language switcher in the header.
- SEO `hreflang` alternate tags.
- Multilingual sitemap output.
- Mobile-first homepage cleanup so users can reach machine cards faster.
- Stronger mobile layout for header, navigation, forms, modals, listing cards, footer, and floating actions.
- `/healthz` returns version `3.8`.

## Railway deployment

1. Upload this project to GitHub.
2. Railway Web Service should point to the GitHub repo.
3. Add PostgreSQL in Railway.
4. Add variables to the Web Service:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
SESSION_SECRET=replace-with-long-random-string
ADMIN_EMAIL=admin@wallprinter.org
ADMIN_PASSWORD=replace-this-password
APP_URL=https://www.wallprinter.org
NODE_ENV=production
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx
MAIL_FROM=Wall Printer Exchange <noreply@wallprinter.org>
```

If your PostgreSQL service has a different name, adjust the `DATABASE_URL` reference.

## Domain

Recommended structure:

```text
www.wallprinter.org -> Railway
wallprinter.org -> 301 redirect to https://www.wallprinter.org
```

In Railway, add `www.wallprinter.org` to the Web Service custom domains. If Railway asks for a port, use `8080`.

## Health check

```text
/healthz
```

Expected response:

```json
{"ok":true,"service":"wall-printer-exchange","version":"3.8"}
```

## Image storage

Images are stored in PostgreSQL as `BYTEA` and served through `/images/:id`. This is acceptable for a small used-machine catalog.

## Notes

Admin pages remain English. Public pages, navigation, core platform pages, main CTAs, and mobile browsing UI are multilingual.
