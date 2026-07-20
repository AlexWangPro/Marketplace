# Wall Printer Exchange v3.8.7

Railway + PostgreSQL + Resend deployment package.

## v3.8.7 updates

- Fixes contact release email reporting: buyer and seller email delivery are tracked separately.
- When seller contact is approved, success now requires the buyer email to be sent successfully.
- Admin request detail now shows:
  - Buyer receives seller contact
  - Seller receives buyer contact
  - Overall contact release status
  - Separate error messages for buyer/seller delivery
- Adds admin resend buttons for contact requests:
  - Send to Buyer
  - Send to Seller
  - Send Both
- Fixes manual match email reporting so buyer delivery failure is no longer hidden when seller emails succeed.
- Keeps v3.8.6 buyer phone requirement and 3-machine buyer selection.
- Keeps v3.8.5 stable admin login.
- Keeps v3.8.4 listing delete and required seller submission fields.

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

After changing variables, redeploy without cache.
