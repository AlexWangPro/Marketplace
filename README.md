# Wall Printer Exchange v3.8.8

Railway + PostgreSQL + Resend deployment package.

## v3.8.8 updates

- Adds admin email notifications for:
  - New seller listing submissions
  - New buyer buying requests
  - New seller contact requests
- Default notification recipient is `dxonjet@gmail.com`.
- Optional Railway variable: `ADMIN_NOTIFICATION_EMAIL=dxonjet@gmail.com`.
- Notification failures are logged in Railway but do not block user submissions.
- Keeps v3.8.8 email delivery tracking and resend controls.

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
