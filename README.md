# Wall Printer Exchange v3.7 — Launch Cleanup

Railway-ready Node/Express + PostgreSQL build for **Wall Printer Exchange**, a used wall printer listing and buyer-introduction platform.

This version is a launch-cleanup release. It keeps the same database model and business logic, while polishing empty states, error pages, mobile layout details, button wording, and deployment documentation.

## What changed in v3.7

- Polished 404 page and general error page.
- Polished submission success screens with clear next steps.
- Cleaner no-results state on the homepage.
- Mobile refinements for header, navigation, footer, floating action buttons, forms, and cards.
- Button copy made more consistent across public pages and modals.
- Added `/healthz` for a simple deployment health check.
- CSS / JS cache versions updated to `v=3.7`.
- README rewritten for the current Railway + Resend workflow.

## Image storage

Uploaded machine images are stored in PostgreSQL in the `machine_images.image` BYTEA column and served through `/images/:id`.

For this curated MVP, this is acceptable if the site only has a small number of machines and images. External image storage can be added later if needed.

Default image limits:

```text
Up to 8 images per machine submission
2MB maximum per image
JPG, PNG, WEBP, or GIF
```

## Core public flow

- Sellers submit used wall printer information, images, location, price, and private contact details.
- Seller submissions are not published automatically.
- Admin reviews and approves machines.
- Public users can browse available, reserved, and sold machines.
- Seller contact details are hidden publicly.
- Buyers can request seller contact or submit a general buying request.
- Admin reviews buyer requests and may release contact details or match machines.
- Buyers remain responsible for verification, inspection, payment, shipping, customs, and final due diligence.

## Core admin flow

- Admin login.
- Review pending seller submissions.
- Preview public machine pages before approval.
- Edit machine details.
- Set machine status: Pending Review, Available, Reserved, Sold, Archived, Rejected.
- Delete machines and buyer requests when needed.
- Review buyer contact requests and buying requests.
- Send buyer/seller introduction emails through Resend when configured.
- Match up to five machines to a buying request.

## Railway deployment

### 1. Upload to GitHub

Unzip the package and upload the **contents** to the root of a GitHub repository.

The repository root should contain:

```text
package.json
package-lock.json
server.js
railway.json
nixpacks.toml
public/
views/
```

Do not upload the parent folder as an extra nested directory.

### 2. Create or update Railway project

Create a Railway project from the GitHub repository, or connect the existing project to the updated repository.

Your Railway project should have:

```text
Web Service
PostgreSQL
```

### 3. Add PostgreSQL

In Railway:

```text
+ New → Database → PostgreSQL
```

### 4. Add variables to the Web Service

Add variables to the **Web Service**, not only the PostgreSQL service.

Required:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
SESSION_SECRET=replace-with-a-long-random-string
ADMIN_EMAIL=your-admin-email@example.com
ADMIN_PASSWORD=your-strong-admin-password
APP_URL=https://www.wallprinter.org
NODE_ENV=production
```

If the database service is named `PostgreSQL`, use:

```text
DATABASE_URL=${{PostgreSQL.DATABASE_URL}}
```

If it has another name, use that exact Railway service name.

Optional:

```text
PGSSL=false
```

Railway internal PostgreSQL usually does not require SSL.

### 5. Email through Resend

Railway Hobby should use Resend API instead of SMTP.

Add these Web Service variables after your Resend domain is verified:

```text
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx
MAIL_FROM=Wall Printer Exchange <noreply@wallprinter.org>
```

The `MAIL_FROM` domain must match a verified domain in Resend.

### 6. Deploy

Railway should run:

```text
npm start
```

The app creates tables automatically on startup and creates the first admin account from `ADMIN_EMAIL` and `ADMIN_PASSWORD` if it does not already exist.

## Custom domain

Recommended structure:

```text
www.wallprinter.org → Railway Web Service
wallprinter.org → 301 redirect to https://www.wallprinter.org
```

In Railway:

```text
Web Service → Settings → Networking → Custom Domain
```

If Railway asks for a port, use:

```text
8080
```

Then copy Railway's DNS records into Namecheap exactly.

## Admin login

Visit:

```text
/admin/login
```

Use the admin email and password configured in Railway variables.

Fallback only if no variables were set:

```text
Email: admin@wallprinter.org
Password: ChangeMe123!
```

Do not use the fallback password in production.

## Post-deploy checks

After every Railway redeploy, check:

```text
/healthz
/
/about
/buyer-guide
/seller-guide
/verification-checklist
/admin/login
/sitemap.xml
```

Then test the admin workflow:

```text
1. Submit a seller machine.
2. Approve it in Admin.
3. Confirm it appears publicly.
4. Submit a buyer contact request.
5. Change request status to Contact Shared.
6. Confirm email delivery if Resend is configured.
7. Submit a general buying request.
8. Match up to five machines in Admin.
```

## Business positioning

Wall Printer Exchange is a listing and introduction platform only.

It does not:

```text
inspect machines
guarantee machine condition
act as seller or buyer
collect payment
hold escrow
arrange shipping or customs
install machines
provide warranty or after-sales service
```

Buyers and sellers must agree transaction terms directly.
