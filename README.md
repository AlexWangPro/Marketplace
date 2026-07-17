# Wall Printer Exchange v3.0 — Railway Prelaunch Polish

This build keeps the Railway Node/Express + PostgreSQL architecture and adds public-site polish, SEO endpoints, image cache headers, and admin readiness reminders.

## Image storage

Machine images are currently stored inside PostgreSQL in the `machine_images.image` BYTEA column and served through `/images/:id`. For a small curated marketplace, this is acceptable for MVP use. No external image storage is required at this stage.

## New in v3.0

- Cleaner Apple-style catalog homepage with search-first UX and collapsible filters.
- Region chips based on actual listed machines.
- SEO meta tags, canonical URLs, Open Graph tags, `robots.txt`, and dynamic `sitemap.xml`.
- Product JSON-LD on machine detail pages.
- Longer image cache headers with `X-Image-Storage: postgres-bytea` for clarity.
- Admin dashboard now warns when email is not configured and shows launch-focused next steps.

---

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
- Machine detail pages with desktop split view, next/previous machine navigation, Apple-style image viewer, and embedded YouTube/Vimeo preview when possible
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
- Admin request matching emails for buyers and sellers

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
APP_URL=https://www.wallprinter.org
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

Recommended for Railway Hobby: use Resend API over HTTPS. Add these variables to the **Web Service**:

```text
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx
MAIL_FROM=Wall Printer Exchange <noreply@wallprinter.org>
```

SMTP is also supported, but Railway only allows outbound SMTP on Pro and above. If you use SMTP, add:

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
- The buyer verification checklist and a link to `/verification-checklist`

If no email provider is configured, the request status is still updated, but the app records that the email was not sent. You can then manually copy seller contact details from Admin.


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

Railway will show the DNS records you need to add at your domain DNS provider. For `www.wallprinter.org`, this is usually a CNAME plus TXT verification record. For the root/apex `wallprinter.org`, use the record Railway shows; if your DNS provider does not allow a root CNAME, use an ALIAS/ANAME/flattened CNAME option if available, or point `www.wallprinter.org` first and redirect the root domain to `www` at your DNS/domain provider.

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

## v2.6 update notes

- Removed public Admin Logs navigation; `/admin/logs` now redirects to the dashboard.
- Admin machine review now supports previewing the exact front-end listing view, one-click approval, and edit access.
- Public machine gallery images can be clicked for enlarged preview.
- Buyer forms no longer ask for shipping support.
- Buyer inspection plan is now a select field with predefined options.
- When Admin approves a seller contact request, both buyer and seller receive each other's contact information by email if SMTP is configured.
- Admin can manually match a buying request with up to 5 available/reserved machines. The buyer receives selected options and seller contacts; matched sellers receive buyer information.
- Public UI and Admin dashboard have been simplified with a cleaner Apple-inspired catalog layout.



## v2.9 update notes

- Machine detail pages now include Back to machines, Previous, and Next machine navigation.
- Desktop machine detail pages use a two-column split: photos on the left, price/details/actions on the right.
- Mobile detail pages stack the same content with compact Apple-style photo viewing and clearer information cards.
- Seller videos from YouTube, YouTube Shorts, youtu.be, and Vimeo are embedded directly when possible.
- Email delivery now supports Resend API via `RESEND_API_KEY`, which is recommended for Railway Hobby because outbound SMTP is restricted.


## v3.1 Admin delete and email test update

- Added permanent delete actions for machine listings in Admin → Machines.
- Added permanent delete actions for buyer requests in Admin → Buyer Requests and request detail pages.
- Improved buyer information contrast/readability in the request detail page.
- Added an Admin Dashboard test email form using the existing email provider configuration.
- Bumped static asset cache versions to v3.1.



## v3.3 cleanup note

This package removes the public listing-count header from the homepage. The previous `.v30-catalog-head` / `.catalog-listings-head` sections are also hidden in CSS as a cache-safety measure.


## v3.4 polish note

This version refines the machine detail page, Admin Machines list, Buyer Requests list, and Buyer Request detail screen. It keeps image storage in PostgreSQL and focuses on cleaner UI, simpler admin actions, and better review flow clarity.


## v3.5 trust content release

Added public trust and guide pages:
- `/about`
- `/buyer-guide`
- `/seller-guide`
- `/verification-checklist`

Also added homepage trust cards, public navigation links, footer guide links, sitemap entries, and asset cache version `v=3.6`.

## v3.6

Added SEO meta refinements, upgraded public asset cache keys to v3.6, and redesigned Resend email templates with branded HTML layouts for test emails, seller contact approvals, buyer introductions, and manual buyer-machine matches.
