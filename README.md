# Wall Printer Exchange v3.9.0

Railway + PostgreSQL + Resend deployment package.

## v3.9.0 updates

- Full Gemini-style UI redesign across public pages and admin pages.
- Rebuilt global header, footer, language switcher, mobile navigation, homepage, listing cards, machine detail page, forms, admin dashboard, machine management, buyer requests, request detail, login, and state pages.
- Adds Tailwind CDN for rapid modern UI styling while retaining existing backend logic and database schema.
- Keeps v3.8.9 portrait-friendly machine photo handling.
- Keeps v3.8.8 admin submission notifications.
- Keeps v3.8.7 buyer/seller email delivery tracking.
- Keeps buyer phone requirement, 3-machine buyer selection, anti-spam listing submission checks, stable admin login, and multilingual auto-detection.

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
