# Wall Printer Exchange v3.8.9

Railway + PostgreSQL + Resend deployment package.

## v3.8.9 updates

- Optimizes homepage listing photos for portrait smartphone uploads.
- Adds a blurred background layer behind each machine photo so vertical images look intentional instead of tiny inside a landscape frame.
- Keeps the main machine photo fully visible with `object-fit: contain`; no aggressive cropping.
- Changes homepage card photo frames to a more portrait-friendly ratio, especially on mobile.
- Keeps v3.8.8 admin submission email notifications.
- Keeps all prior admin, buyer request, multilingual, and anti-spam features.

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
