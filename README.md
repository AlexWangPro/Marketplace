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
- Floating action buttons for seller machine submission and buyer request
- Seller machine submission modal with mandatory terms review before the form appears
- Seller machine submission form with declaration acknowledgement
- Buyer contact request form for a specific machine
- General buying request modal and fallback page

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
- When a machine contact request is changed to Contact Shared, send the buyer seller contact details and the verification checklist by email if SMTP is configured
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

Optional database SSL:

```text
PGSSL=false
```

Railway internal PostgreSQL usually does not require SSL. If you use an external PostgreSQL provider that requires SSL, set:

```text
PGSSL=true
```

### Optional email delivery

To email buyers when Admin approves seller contact release, add SMTP variables to the **Web Service**:

```text
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password
MAIL_FROM=Wall Printer Exchange <noreply@wallprinter.org>
```

When Admin opens a buyer contact request and changes status to `Contact Shared`, the app sends the buyer an email containing:

- Machine title and listing link
- Seller name, email, phone, WhatsApp, preferred contact, location, and exact address if available
- A clear disclaimer that Wall Printer Exchange does not inspect, guarantee, collect payment, ship, install, or provide after-sales service
- The buyer verification checklist and a link to `/inspection-checklist`

If SMTP is not configured, the request status is still updated, but the app records that the email was not sent. You can then manually copy seller contact details from Admin.


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

## Interaction changes

- Public top navigation has been removed. The homepage focuses on machine browsing and filtering.
- `List Your Machine` and `Buying Request` are only exposed as right-bottom floating buttons on public pages.
- Seller submission starts with Terms. The machine form is hidden until the seller checks the confirmation box and clicks Continue.
- The original `/submit-machine` and `/buying-request` routes remain as fallback direct pages but are not linked from the public header or footer.
- Admin approval of seller contact release can trigger the buyer email with the verification checklist.

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


## Railway build troubleshooting

This package includes a public-registry `package-lock.json`, `.npmrc`, and `nixpacks.toml`. Railway/Nixpacks should install production dependencies from `https://registry.npmjs.org/`.

When uploading to GitHub, make sure `package.json`, `server.js`, `railway.json`, and `nixpacks.toml` are in the repository root. Do not upload the parent folder as an extra nested directory.

If Railway stays on **Building the image** for too long, use **Deployments → View Logs** and confirm it reaches `npm install --omit=dev`. If it cannot fetch packages, clear the Railway build cache and redeploy.


## Railway npm registry fix

This package includes a public-registry `package-lock.json`, `.npmrc`, and `nixpacks.toml` so Railway should install dependencies from `https://registry.npmjs.org/`, not from any local/internal registry. If your previous GitHub repository still contains an old `package-lock.json`, replace it with this one or delete all files in the repository before uploading this version.

If Railway still tries to download from an internal OpenAI/Caas registry, clear the build cache and redeploy without cache.
