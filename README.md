# Wall Printer Exchange v3.9.2

Railway + PostgreSQL + Resend deployment package.

## v3.9.2 updates

- Removes the Tailwind CDN from `views/partials/head.ejs`.
- Builds production CSS locally into `public/styles.css`.
- Adds `src/tailwind-local.css`, `src/app.css`, and `src/production-overrides.css`.
- Adds `scripts/build-css.js`.
- Updates `npm run build` to run the CSS build before checking `server.js`.
- Keeps the v3.9 Gemini-style redesign and v3.9.1 large form redesign.
- Keeps admin notification email delivery to `dxonjet@gmail.com` through `ADMIN_NOTIFICATION_EMAIL`.

## Railway variables

Set these on the Web Service, not the Postgres service:

- DATABASE_URL=${{Postgres.DATABASE_URL}}
- SESSION_SECRET=change-me
- ADMIN_EMAIL=your-admin-email
- ADMIN_PASSWORD=your-admin-password
- APP_URL=https://www.wallprinter.org
- NODE_ENV=production
- RESEND_API_KEY=re_xxx
- MAIL_FROM=Wall Printer Exchange <noreply@wallprinter.org>
- ADMIN_NOTIFICATION_EMAIL=dxonjet@gmail.com

After changing variables, redeploy without cache.

## Build

```bash
npm run build
```

This generates `public/styles.css` locally and then runs `node --check server.js`.

## Start

```bash
npm start
```
