# WallPrinter.org Product Directory MVP

A lightweight product publishing platform for wallprinter.org.

It includes:

- Public product directory
- Product detail pages
- User registration and login
- User dashboard
- Product submission with up to 5 images
- Admin dashboard
- Admin product approval / rejection / archive / delete
- Admin user management
- Admin category management
- Inquiry collection
- Admin activity logs
- PostgreSQL database auto-initialization

## Tech stack

- Node.js
- Express
- EJS templates
- PostgreSQL
- Railway-ready deployment

This is intentionally simpler than a Next.js marketplace so it is easier to deploy, debug, and maintain during MVP stage.

## Important MVP note about images

Product images are stored as database data URLs for simplicity.

Limit:

- 5 images per product
- 2MB per image

This is good for an MVP and demo launch. For serious production traffic, move images to Cloudinary, S3, R2, or Supabase Storage.

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

3. Set your local PostgreSQL `DATABASE_URL` in `.env`.

4. Start the app:

```bash
npm run dev
```

5. Open:

```text
http://localhost:3000
```

## Railway deployment

1. Create a GitHub repository.
2. Upload all files from this project to the repository root.
3. In Railway, create a new project from your GitHub repository.
4. Add a PostgreSQL database service in the same Railway project.
5. Make sure the web service has access to `DATABASE_URL`.
6. Add these variables to your web service:

```text
SESSION_SECRET=use-a-long-random-secret
ADMIN_EMAIL=your-admin-email@domain.com
ADMIN_PASSWORD=your-strong-admin-password
APP_URL=https://wallprinter.org
NODE_ENV=production
```

7. Deploy.

The app creates database tables automatically on startup.

## First admin login

The system seeds one admin user when no admin user exists.

Default values are:

```text
Email: admin@wallprinter.org
Password: ChangeMe123!
```

Before public launch, change these in Railway variables:

```text
ADMIN_EMAIL=
ADMIN_PASSWORD=
```

Then redeploy before real users register.

## Domain setup for wallprinter.org

In Railway:

1. Open your web service.
2. Go to Settings.
3. Find Public Networking.
4. Add Custom Domain.
5. Enter `wallprinter.org` or `www.wallprinter.org`.
6. Railway will show the required DNS record.
7. Add the DNS record at your domain/DNS provider.

Recommended setup:

```text
wallprinter.org     -> Railway app
www.wallprinter.org -> Railway app or redirect to root domain
```

If you still use SiteGround for other sites, only point this specific domain or subdomain to Railway. Do not change unrelated domains.

## Admin URLs

```text
/admin
/admin/products
/admin/users
/admin/categories
/admin/inquiries
/admin/logs
```

## User URLs

```text
/register
/login
/dashboard
/dashboard/products/new
```

## Production improvement checklist

After the MVP is working, the next best improvements are:

1. Move product images from PostgreSQL to Cloudinary / S3 / R2 / Supabase Storage.
2. Add email notification when a product is approved or rejected.
3. Add inquiry email forwarding to admin.
4. Add SEO fields for product pages.
5. Add pagination for products and admin tables.
6. Add product verification badges.
7. Add anti-spam checks for registration and inquiries.
8. Add password reset.
9. Add admin product editing.
10. Add multilingual pages if targeting global suppliers and buyers.

