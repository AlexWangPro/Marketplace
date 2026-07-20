# Wall Printer Exchange v3.8.4

Railway Node/Express version for Wall Printer Exchange.

## What is new in v3.8.4

### Admin listing deletion

- Delete button is available in the full Machines admin page.
- Delete button is now also available in the Dashboard recent machines table, including pending review submissions.
- Delete button is now available on the Edit Machine page header and in a dedicated danger zone.
- Deleting a machine permanently removes the listing and uploaded machine images. Buyer requests remain, but their machine reference is set to null by the database.

### Seller submission anti-spam hardening

Seller listing submission is now stricter on both the frontend and backend.

New required items include:

- Company / seller type
- Preferred contact method
- Brand
- Model
- Production year
- Purchase year
- Printhead type
- Number of printheads
- Working status
- Asking price
- Currency
- Price negotiable selection
- Machine description with at least 80 characters
- Known defects, or `None`
- Included accessories, or `None`
- Exact address, stored privately
- At least one image
- At least one direct phone or WhatsApp number

The seller form also includes a hidden honeypot field to reject common bot submissions.

### Version

`/healthz` returns version `3.8.4`.

## Railway variables

Set these on the website Web Service, not the Postgres service:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
SESSION_SECRET=replace-with-a-long-random-secret
ADMIN_EMAIL=admin@wallprinter.org
ADMIN_PASSWORD=replace-with-a-strong-password
APP_URL=https://www.wallprinter.org
NODE_ENV=production
RESEND_API_KEY=re_xxxxxxxxx
MAIL_FROM=Wall Printer Exchange <noreply@wallprinter.org>
```

After changing `ADMIN_EMAIL` or `ADMIN_PASSWORD`, redeploy the web service. The app syncs Railway admin credentials into the database on deploy.

## Deployment

1. Replace the repository files with this package.
2. Commit and push.
3. Railway → Web Service → Redeploy without cache.
4. Check `/healthz`.
5. Check `/admin/login`.
6. Test a seller submission from `/submit-machine`.

## Health check

```json
{"ok":true,"service":"wall-printer-exchange","version":"3.8.4"}
```
