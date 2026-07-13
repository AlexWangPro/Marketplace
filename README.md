# Wall Printer Exchange

A lightweight Railway-ready MVP for **Wall Printer Exchange**, a used wall printer listing and buyer-request platform.

The platform is designed as a listing and introduction service, not a transaction, escrow, inspection, shipping, or warranty provider.

## Core features

### Public website

- High-end, minimal B2B design
- Public used wall printer listings
- Regional filtering:
  - Europe
  - North America
  - South America
  - Asia
  - Middle East
  - Africa
  - Oceania
- Machine status shown publicly:
  - Available
  - Reserved
  - Sold
- Sold machines remain visible for reference and lead capture
- Machine detail pages
- Seller contact details hidden from public pages
- Buyer verification checklist
- Seller machine submission form with declaration acknowledgement
- Buyer contact request form for a specific machine
- General buying request form

### Admin

- Admin login
- Admin-only dashboard
- Review pending seller submissions
- Approve listings by setting status to Available
- Mark machines Reserved / Sold / Archived / Rejected
- Edit listing information
- View private seller contact details and exact address
- Review buyer requests and contact requests
- Mark requests as New / Reviewed / Contact Shared / Matched / Closed / Spam / Archived
- Admin logs

## Tech stack

- Node.js
- Express
- EJS templates
- PostgreSQL
- Railway compatible

## Railway deployment

### 1. Upload to GitHub

Unzip this project and upload the contents to a GitHub repository.

### 2. Create Railway project

Create a Railway project from the GitHub repository.

### 3. Add PostgreSQL

In the same Railway project:

```text
+ New → Database → PostgreSQL
```

### 4. Add variables to the Web Service

Important: add these variables to the **Web Service**, not only the PostgreSQL service.

Required:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
SESSION_SECRET=replace-with-a-long-random-string
ADMIN_EMAIL=your-admin-email@example.com
ADMIN_PASSWORD=your-strong-admin-password
APP_URL=https://wallprinter.org
NODE_ENV=production
```

If Railway names your database service `PostgreSQL`, use:

```text
DATABASE_URL=${{PostgreSQL.DATABASE_URL}}
```

If Railway names it something else, use that exact service name.

Optional:

```text
PGSSL=false
```

Railway internal PostgreSQL usually does not require SSL. If you use an external PostgreSQL provider that requires SSL, set:

```text
PGSSL=true
```

### 5. Deploy

Railway should run:

```text
npm start
```

The app automatically creates the database tables and the first admin account from `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

## Admin login

Visit:

```text
/admin/login
```

Use the email and password configured in Railway variables.

If you do not set `ADMIN_EMAIL` and `ADMIN_PASSWORD`, the app creates this fallback admin account:

```text
Email: admin@wallprinter.org
Password: ChangeMe123!
```

Do not use the fallback password in production.

## Custom domain: wallprinter.org

In Railway:

```text
Web Service → Settings → Networking → Custom Domain
```

Add:

```text
wallprinter.org
```

Railway will show the DNS records you need to add at your domain DNS provider.

## Image storage note

For MVP simplicity, uploaded images are stored in PostgreSQL as `BYTEA`.

Default limits:

- Up to 8 images per submission
- 2MB maximum per image

For serious production usage, move images to Cloudflare R2, S3, Cloudinary, or Supabase Storage.

## Business-role disclaimer

The website copy and forms are written around this positioning:

- Wall Printer Exchange is a listing and introduction platform
- Seller contact information is hidden publicly
- Admin may share seller contact only with reviewed buyers
- Buyers must independently verify the machine and seller
- The platform does not inspect machines
- The platform does not guarantee machine condition
- The platform does not collect payment
- The platform may charge an introduction fee, referral fee, success fee, listing fee, or commission when separately agreed in writing

## Local development

Create a PostgreSQL database and set `.env` values locally, then run:

```text
npm install
npm run dev
```

Or:

```text
npm install
npm start
```
