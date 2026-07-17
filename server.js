const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

const REGIONS = ['Europe', 'North America', 'South America', 'Asia', 'Middle East', 'Africa', 'Oceania'];

const LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', dir: 'ltr' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', dir: 'ltr' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', dir: 'ltr' },
  { code: 'fr', name: 'French', nativeName: 'Français', dir: 'ltr' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', dir: 'ltr' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', dir: 'ltr' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', dir: 'ltr' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', dir: 'ltr' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', dir: 'rtl' }
];
const LANGUAGE_CODES = LANGUAGES.map(language => language.code);
const DEFAULT_LANG = 'en';
const LOCALES = Object.fromEntries(LANGUAGES.map(language => {
  const file = path.join(__dirname, 'locales', `${language.code}.json`);
  return [language.code, JSON.parse(fs.readFileSync(file, 'utf8'))];
}));

function translate(lang, key) {
  return (LOCALES[lang] && LOCALES[lang][key]) || LOCALES.en[key] || key;
}

function localizedPath(pathname = '/', lang = DEFAULT_LANG) {
  const clean = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (!lang || lang === DEFAULT_LANG) return clean;
  return `/${lang}${clean === '/' ? '' : clean}`;
}

function localizedAbsolute(pathname = '/', lang = DEFAULT_LANG) {
  return absoluteUrl(localizedPath(pathname, lang));
}

const MACHINE_STATUSES = ['pending_review', 'available', 'reserved', 'sold', 'archived', 'rejected'];
const REQUEST_STATUSES = ['new', 'reviewed', 'contact_shared', 'matched', 'closed', 'spam', 'archived'];
const INSPECTION_PLANS = [
  'Live video demonstration',
  'Third-party inspection',
  'Local representative visit',
  'Recent photos and videos first',
  'Not decided yet'
];
const MAX_UPLOAD_IMAGES = 8;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

if (!process.env.DATABASE_URL) {
  console.error('\nMissing DATABASE_URL. Add a PostgreSQL database and set DATABASE_URL.');
  console.error('Railway: Web Service → Variables → add DATABASE_URL=${{Postgres.DATABASE_URL}}\n');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: String(process.env.PGSSL).toLowerCase() === 'true' ? { rejectUnauthorized: false } : false
});


const CHECKLIST_ITEMS = [
  'Confirm the seller identity, company details, phone, email, and authorization to sell the machine.',
  'Confirm machine ownership with invoice, purchase record, serial number, nameplate, or other ownership documents.',
  'Request recent photos and videos of the full machine, printheads, ink system, rails, accessories, software screen, and nameplate.',
  'Arrange a live video demonstration showing startup, movement, nozzle test, and real printing if possible.',
  'Check printhead model, number of printheads, nozzle condition, print quality, ink flow, and any replacement history.',
  'Confirm included accessories such as rails, extension poles, computer, software, dongle, spare parts, tools, manuals, and packaging.',
  'Ask about production year, purchase year, usage frequency, maintenance history, repairs, known defects, storage condition, and whether the machine is still working.',
  'Consider in-person inspection, local representative inspection, or third-party inspection before payment.',
  'Clarify packaging, pickup address, machine dimensions, weight, export documents, customs, duties, taxes, insurance, and shipping damage responsibility.',
  'Use a written agreement covering condition, included items, price, payment terms, delivery terms, inspection rights, refund terms, and after-sale responsibilities.',
  'Avoid risky payments. Wall Printer Exchange is not an escrow provider and does not hold buyer or seller funds.'
];

function absoluteUrl(pathname = '/') {
  const base = (process.env.APP_URL || 'https://www.wallprinter.org').replace(/\/$/, '');
  return `${base}${pathname.startsWith('/') ? pathname : '/' + pathname}`;
}

function mailConfigured() {
  return Boolean(process.env.RESEND_API_KEY || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS));
}

async function sendMail({ to, subject, text, html }) {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || 'Wall Printer Exchange <noreply@wallprinter.org>';

  if (process.env.RESEND_API_KEY) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ from, to: [to], subject, html: html || `<pre>${escapeHtml(text || '')}</pre>`, text })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = payload.message || payload.error || `Resend API returned ${response.status}`;
        console.error('Email send failed:', message);
        return { sent: false, reason: message };
      }
      return { sent: true, provider: 'resend', id: payload.id };
    } catch (err) {
      console.error('Email send failed:', err.message);
      return { sent: false, reason: err.message || 'Email send failed' };
    }
  }

  if (!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)) {
    console.warn('Email provider not configured. Email was not sent:', subject, 'to', to);
    return { sent: false, reason: 'Email provider not configured' };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  try {
    await transporter.sendMail({ from, to, subject, text, html });
    return { sent: true, provider: 'smtp' };
  } catch (err) {
    console.error('Email send failed:', err.message);
    return { sent: false, reason: err.message || 'Email send failed' };
  }
}

function renderChecklistText() {
  return CHECKLIST_ITEMS.map((item, index) => `${index + 1}. ${item}`).join('\n');
}

function renderChecklistHtml() {
  return `<ol style="padding-left:22px;margin:12px 0 0;color:#374151;">${CHECKLIST_ITEMS.map(item => `<li style="margin:0 0 10px;">${escapeHtml(item)}</li>`).join('')}</ol>`;
}

function compactContactText(lines) {
  return lines.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`).join('\n');
}

function compactContactHtml(lines) {
  return lines
    .filter(([, value]) => value)
    .map(([label, value]) => `<tr><th align="left" style="padding:10px 18px 10px 0;color:#6b7280;font-size:13px;font-weight:600;white-space:nowrap;border-bottom:1px solid #edf0f4;vertical-align:top;">${escapeHtml(label)}</th><td style="padding:10px 0;color:#111827;font-size:14px;border-bottom:1px solid #edf0f4;vertical-align:top;">${escapeHtml(value)}</td></tr>`)
    .join('');
}

function emailButton(url, label) {
  if (!url || !label) return '';
  return `<p style="margin:26px 0 8px;"><a href="${url}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:700;border-radius:999px;padding:12px 18px;">${escapeHtml(label)}</a></p>`;
}

function emailNotice(message) {
  return `<div style="background:#fff7ed;border:1px solid #fed7aa;color:#7c2d12;padding:16px 18px;border-radius:16px;margin:24px 0;font-size:14px;line-height:1.6;"><strong>Important:</strong> ${escapeHtml(message)}</div>`;
}

function emailLayout({ title, eyebrow = 'Wall Printer Exchange', preheader = '', body = '', ctaUrl = '', ctaLabel = '' }) {
  const homeUrl = absoluteUrl('/');
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#111827;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader || title)}</div>
  <div style="max-width:760px;margin:0 auto;padding:28px 16px;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:28px;overflow:hidden;box-shadow:0 18px 50px rgba(15,23,42,.08);">
      <div style="padding:26px 30px;border-bottom:1px solid #eef0f3;background:linear-gradient(180deg,#ffffff 0%,#fafafa 100%);">
        <a href="${homeUrl}" style="display:inline-flex;align-items:center;gap:10px;color:#111827;text-decoration:none;">
          <span style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;border-radius:11px;background:#111827;color:#ffffff;font-size:12px;font-weight:800;letter-spacing:.04em;">WPE</span>
          <span style="display:inline-block;vertical-align:middle;"><strong style="display:block;font-size:16px;">Wall Printer Exchange</strong><span style="display:block;color:#6b7280;font-size:12px;">Used wall printer introductions</span></span>
        </a>
      </div>
      <div style="padding:32px 30px 34px;">
        <p style="margin:0 0 10px;color:#2563eb;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;">${escapeHtml(eyebrow)}</p>
        <h1 style="margin:0 0 18px;font-size:30px;line-height:1.12;letter-spacing:-.04em;color:#111827;">${escapeHtml(title)}</h1>
        <div style="font-size:15px;line-height:1.65;color:#374151;">${body}</div>
        ${emailButton(ctaUrl, ctaLabel)}
      </div>
    </div>
    <p style="max-width:680px;margin:18px auto 0;color:#8a8f98;font-size:12px;line-height:1.55;text-align:center;">Wall Printer Exchange is a listing and introduction platform only. Buyers and sellers are responsible for inspection, payment, shipping, customs, installation, and after-sale terms.</p>
  </div>
</body></html>`;
}

function sellerContactLines(request) {
  return [
    ['Seller name', request.seller_name],
    ['Company', request.seller_company],
    ['Email', request.seller_email],
    ['Phone', request.seller_phone],
    ['WhatsApp', request.seller_whatsapp],
    ['Preferred contact', request.seller_preferred_contact],
    ['Machine location', [request.machine_region, request.machine_country, request.machine_city].filter(Boolean).join(' · ')],
    ['Exact address', request.exact_address]
  ];
}

function buyerContactLines(request) {
  return [
    ['Buyer name', request.buyer_name],
    ['Company', request.buyer_company],
    ['Email', request.buyer_email],
    ['Phone', request.buyer_phone],
    ['WhatsApp', request.buyer_whatsapp],
    ['Country', request.buyer_country],
    ['Timeline', request.timeline],
    ['Inspection plan', request.inspection_plan],
    ['Message', request.message]
  ];
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function imageUrl(imageId) {
  return imageId ? absoluteUrl(`/images/${imageId}`) : '';
}

async function sendContactReleaseEmails(request) {
  if (!request || request.request_type !== 'contact' || !request.buyer_email || !request.machine_title) {
    return { sent: false, reason: 'Request is not an eligible contact release.' };
  }

  const sellerLines = sellerContactLines(request).filter(([, value]) => value);
  const buyerLines = buyerContactLines(request).filter(([, value]) => value);
  const listingUrl = request.machine_slug ? absoluteUrl(`/machine/${request.machine_slug}`) : absoluteUrl('/');
  const checklistUrl = absoluteUrl('/verification-checklist');
  const subject = `Seller contact approved: ${request.machine_title}`;

  const sellerText = compactContactText(sellerLines);
  const sellerHtml = compactContactHtml(sellerLines);
  const buyerText = compactContactText(buyerLines);
  const buyerHtml = compactContactHtml(buyerLines);
  const platformNotice = 'Wall Printer Exchange does not inspect, guarantee, sell, warrant, collect payment, ship, install, or provide after-sales service for this machine. Please verify the machine, seller, ownership, payment terms, shipping, customs, and all transaction details before purchase.';

  const buyerMail = await sendMail({
    to: request.buyer_email,
    subject,
    text: `Hello ${request.buyer_name || ''},\n\nYour request to view seller contact information has been approved by Wall Printer Exchange.\n\nMachine: ${request.machine_title}\nListing: ${listingUrl}\n\nSeller contact information:\n${sellerText || 'Seller contact information is currently incomplete. Please contact Wall Printer Exchange for details.'}\n\nImportant: ${platformNotice}\n\nBuyer Verification Checklist:\n${renderChecklistText()}\n\nFull checklist: ${checklistUrl}\n\nWall Printer Exchange`,
    html: emailLayout({
      title: 'Seller contact approved',
      preheader: `Seller contact details are ready for ${request.machine_title}.`,
      body: `
        <p style="margin:0 0 16px;">Hello ${escapeHtml(request.buyer_name || '')},</p>
        <p style="margin:0 0 16px;">Your request to view seller contact information has been approved.</p>
        <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:18px;padding:18px;margin:18px 0;">
          <strong style="display:block;color:#111827;margin-bottom:6px;">${escapeHtml(request.machine_title)}</strong>
          <a href="${listingUrl}" style="color:#2563eb;text-decoration:none;">View machine listing</a>
        </div>
        <h2 style="font-size:18px;margin:24px 0 10px;color:#111827;">Seller contact</h2>
        <table style="width:100%;border-collapse:collapse;">${sellerHtml || '<tr><td>Seller contact information is currently incomplete. Please contact Wall Printer Exchange for details.</td></tr>'}</table>
        ${emailNotice(platformNotice)}
        <h2 style="font-size:18px;margin:24px 0 10px;color:#111827;">Buyer verification checklist</h2>
        ${renderChecklistHtml()}
      `,
      ctaUrl: checklistUrl,
      ctaLabel: 'Open verification checklist'
    })
  });

  let sellerMail = { sent: false, reason: 'Seller email not available' };
  if (request.seller_email) {
    sellerMail = await sendMail({
      to: request.seller_email,
      subject: `Buyer introduction approved: ${request.machine_title}`,
      text: `Hello ${request.seller_name || ''},\n\nWall Printer Exchange has approved a buyer introduction for your listed machine.\n\nMachine: ${request.machine_title}\nListing: ${listingUrl}\n\nBuyer contact information:\n${buyerText || 'Buyer contact information is incomplete.'}\n\nYou and the buyer may now communicate directly. Wall Printer Exchange does not collect payment, inspect the machine, arrange shipping, or provide warranty for this transaction.\n\nWall Printer Exchange`,
      html: emailLayout({
        title: 'Buyer introduction approved',
        preheader: `A buyer introduction was approved for ${request.machine_title}.`,
        body: `
          <p style="margin:0 0 16px;">Hello ${escapeHtml(request.seller_name || '')},</p>
          <p style="margin:0 0 16px;">A buyer introduction has been approved for your listed machine.</p>
          <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:18px;padding:18px;margin:18px 0;">
            <strong style="display:block;color:#111827;margin-bottom:6px;">${escapeHtml(request.machine_title)}</strong>
            <a href="${listingUrl}" style="color:#2563eb;text-decoration:none;">View machine listing</a>
          </div>
          <h2 style="font-size:18px;margin:24px 0 10px;color:#111827;">Buyer contact</h2>
          <table style="width:100%;border-collapse:collapse;">${buyerHtml || '<tr><td>Buyer contact information is incomplete.</td></tr>'}</table>
          <p style="margin:22px 0 0;">You and the buyer may now communicate directly. Wall Printer Exchange does not collect payment, inspect the machine, arrange shipping, or provide warranty for this transaction.</p>
        `,
        ctaUrl: listingUrl,
        ctaLabel: 'Open listing'
      })
    });
  }

  return {
    sent: Boolean(buyerMail.sent || sellerMail.sent),
    buyer: buyerMail,
    seller: sellerMail,
    reason: [buyerMail, sellerMail].filter(r => !r.sent && r.reason).map(r => r.reason).join('; ')
  };
}

async function sendManualMatchEmails(request, machines) {
  if (!request || request.request_type !== 'buying' || !request.buyer_email || !machines.length) {
    return { sent: false, reason: 'No eligible buying request or matched machines.' };
  }

  const checklistUrl = absoluteUrl('/verification-checklist');
  const platformNotice = 'Wall Printer Exchange is a listing and introduction platform only. We do not inspect, guarantee, sell, warrant, collect payment, ship, install, or provide after-sales service for any machine. Please complete independent verification before payment.';

  const machineBlocksText = machines.map((m, index) => {
    const listingUrl = m.slug ? absoluteUrl(`/machine/${m.slug}`) : absoluteUrl('/');
    const sellerText = compactContactText([
      ['Seller name', m.seller_name],
      ['Company', m.seller_company],
      ['Email', m.seller_email],
      ['Phone', m.seller_phone],
      ['WhatsApp', m.seller_whatsapp],
      ['Preferred contact', m.seller_preferred_contact]
    ]);
    return `${index + 1}. ${m.title}\nLocation: ${[m.region, m.country, m.city].filter(Boolean).join(' · ') || 'Not specified'}\nPrice: ${money(m.asking_price, m.currency)}\nListing: ${listingUrl}\nSeller contact:\n${sellerText || 'Seller contact information is incomplete.'}`;
  }).join('\n\n');

  const machineBlocksHtml = machines.map((m, index) => {
    const listingUrl = m.slug ? absoluteUrl(`/machine/${m.slug}`) : absoluteUrl('/');
    const sellerHtml = compactContactHtml([
      ['Seller name', m.seller_name],
      ['Company', m.seller_company],
      ['Email', m.seller_email],
      ['Phone', m.seller_phone],
      ['WhatsApp', m.seller_whatsapp],
      ['Preferred contact', m.seller_preferred_contact]
    ]);
    return `<div style="border:1px solid #e5e7eb;border-radius:18px;padding:18px;margin:14px 0;background:#ffffff;">
      <p style="margin:0 0 6px;color:#2563eb;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;">Match ${index + 1}</p>
      <h3 style="margin:0 0 10px;font-size:20px;line-height:1.25;color:#111827;">${escapeHtml(m.title)}</h3>
      <p style="margin:0 0 12px;color:#4b5563;"><strong>Location:</strong> ${escapeHtml([m.region, m.country, m.city].filter(Boolean).join(' · ') || 'Not specified')}<br><strong>Price:</strong> ${escapeHtml(money(m.asking_price, m.currency))}<br><strong>Listing:</strong> <a href="${listingUrl}" style="color:#2563eb;text-decoration:none;">Open listing</a></p>
      <table style="width:100%;border-collapse:collapse;">${sellerHtml || '<tr><td>Seller contact information is incomplete.</td></tr>'}</table>
    </div>`;
  }).join('');

  const buyerMail = await sendMail({
    to: request.buyer_email,
    subject: 'Matched used wall printers for your request',
    text: `Hello ${request.buyer_name || ''},\n\nWall Printer Exchange has matched ${machines.length} used wall printer option(s) for your buying request. Please review the options below and contact sellers directly for verification and negotiation.\n\n${machineBlocksText}\n\nImportant: ${platformNotice}\n\nBuyer Verification Checklist:\n${renderChecklistText()}\n\nFull checklist: ${checklistUrl}\n\nWall Printer Exchange`,
    html: emailLayout({
      title: 'Matched used wall printers',
      preheader: `${machines.length} used wall printer option(s) matched for your request.`,
      body: `
        <p style="margin:0 0 16px;">Hello ${escapeHtml(request.buyer_name || '')},</p>
        <p style="margin:0 0 16px;">We matched <strong>${machines.length}</strong> used wall printer option(s) for your buying request. Please review the options below and contact sellers directly for verification and negotiation.</p>
        ${machineBlocksHtml}
        ${emailNotice(platformNotice)}
        <h2 style="font-size:18px;margin:24px 0 10px;color:#111827;">Buyer verification checklist</h2>
        ${renderChecklistHtml()}
      `,
      ctaUrl: checklistUrl,
      ctaLabel: 'Open verification checklist'
    })
  });

  const sellerResults = [];
  for (const m of machines) {
    if (!m.seller_email) {
      sellerResults.push({ machineId: m.id, sent: false, reason: 'Seller email not available' });
      continue;
    }
    const buyerHtml = compactContactHtml(buyerContactLines(request));
    const listingUrl = m.slug ? absoluteUrl(`/machine/${m.slug}`) : absoluteUrl('/');
    const result = await sendMail({
      to: m.seller_email,
      subject: `Buyer match for your listed machine: ${m.title}`,
      text: `Hello ${m.seller_name || ''},\n\nWall Printer Exchange has matched a buyer request with your listed machine.\n\nMachine: ${m.title}\nListing: ${listingUrl}\n\nBuyer contact information:\n${compactContactText(buyerContactLines(request))}\n\nYou and the buyer may now communicate directly. Wall Printer Exchange does not collect payment, inspect the machine, arrange shipping, or provide warranty for this transaction.\n\nWall Printer Exchange`,
      html: emailLayout({
        title: 'Buyer match for your machine',
        preheader: `A buyer request was matched with ${m.title}.`,
        body: `
          <p style="margin:0 0 16px;">Hello ${escapeHtml(m.seller_name || '')},</p>
          <p style="margin:0 0 16px;">A buyer request has been matched with your listed machine.</p>
          <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:18px;padding:18px;margin:18px 0;">
            <strong style="display:block;color:#111827;margin-bottom:6px;">${escapeHtml(m.title)}</strong>
            <a href="${listingUrl}" style="color:#2563eb;text-decoration:none;">View machine listing</a>
          </div>
          <h2 style="font-size:18px;margin:24px 0 10px;color:#111827;">Buyer contact</h2>
          <table style="width:100%;border-collapse:collapse;">${buyerHtml || '<tr><td>Buyer contact information is incomplete.</td></tr>'}</table>
          <p style="margin:22px 0 0;">You and the buyer may now communicate directly. Wall Printer Exchange does not collect payment, inspect the machine, arrange shipping, or provide warranty for this transaction.</p>
        `,
        ctaUrl: listingUrl,
        ctaLabel: 'Open listing'
      })
    });
    sellerResults.push({ machineId: m.id, ...result });
  }

  return {
    sent: Boolean(buyerMail.sent || sellerResults.some(r => r.sent)),
    buyer: buyerMail,
    sellers: sellerResults,
    reason: [buyerMail, ...sellerResults].filter(r => !r.sent && r.reason).map(r => r.reason).join('; ')
  };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_UPLOAD_IMAGES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only JPG, PNG, WEBP, or GIF images are allowed.'));
    }
    cb(null, true);
  }
});

function machineUpload(req, res, next) {
  upload.array('images', MAX_UPLOAD_IMAGES)(req, res, (err) => {
    if (!err) return next();

    let message = err.message || 'Image upload failed.';
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') message = 'One or more images are too large. Each image must be 2MB or smaller.';
      if (err.code === 'LIMIT_FILE_COUNT') message = `You can upload up to ${MAX_UPLOAD_IMAGES} images.`;
      if (err.code === 'LIMIT_UNEXPECTED_FILE') message = 'Unexpected upload field. Please upload images only through the Images field.';
    }

    return res.status(400).render('public/submit-machine', {
      title: 'Submit Your Machine',
      form: req.body || {},
      errors: [message]
    });
  });
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(session({
  name: 'wpe.sid',
  secret: process.env.SESSION_SECRET || 'dev-only-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 8
  }
}));

app.use((req, res, next) => {
  const match = req.url.match(new RegExp(`^/(${LANGUAGE_CODES.join('|')})(?=/|\?|$)`));
  req.lang = DEFAULT_LANG;
  req.langPrefix = '';
  req.localizedOriginalUrl = req.originalUrl;
  if (match) {
    req.lang = match[1];
    req.langPrefix = req.lang === DEFAULT_LANG ? '' : `/${req.lang}`;
    let stripped = req.url.slice(match[0].length);
    if (!stripped) stripped = '/';
    if (stripped.startsWith('?')) stripped = '/' + stripped;
    req.url = stripped;
  }
  next();
});

app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.lang = req.lang || DEFAULT_LANG;
  res.locals.langPrefix = req.langPrefix || '';
  res.locals.languages = LANGUAGES;
  res.locals.currentLanguage = LANGUAGES.find(language => language.code === res.locals.lang) || LANGUAGES[0];
  res.locals.t = (key) => translate(res.locals.lang, key);
  res.locals.localPath = (pathname) => localizedPath(pathname, res.locals.lang);
  res.locals.langUrl = (code, pathname = req.path) => localizedPath(pathname, code);
  res.locals.localizedAbsolute = (pathname) => localizedAbsolute(pathname, res.locals.lang);
  res.locals.admin = req.session.admin || null;
  res.locals.regions = REGIONS;
  res.locals.machineStatuses = MACHINE_STATUSES;
  res.locals.requestStatuses = REQUEST_STATUSES;
  res.locals.inspectionPlans = INSPECTION_PLANS;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.statusLabel = statusLabel;
  res.locals.formatDate = formatDate;
  res.locals.money = money;
  res.locals.truncate = truncate;
  res.locals.videoEmbedUrl = videoEmbedUrl;
  res.locals.absoluteUrl = absoluteUrl;
  res.locals.imageUrl = imageUrl;
  res.locals.mailConfigured = mailConfigured();
  next();
});

function flash(req, type, message) {
  req.session.flash = { type, message };
}

function requireAdmin(req, res, next) {
  if (!req.session.admin) return res.redirect('/admin/login');
  next();
}

function statusLabel(status) {
  const labels = {
    pending_review: 'Pending Review',
    available: 'Available',
    reserved: 'Reserved',
    sold: 'Sold',
    archived: 'Archived',
    rejected: 'Rejected',
    new: 'New',
    reviewed: 'Reviewed',
    contact_shared: 'Contact Shared',
    matched: 'Matched',
    closed: 'Closed',
    spam: 'Spam'
  };
  return labels[status] || status;
}

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function money(value, currency) {
  if (value === null || value === undefined || value === '') return 'Price on request';
  const number = Number(value);
  if (Number.isNaN(number)) return 'Price on request';
  return `${currency || 'USD'} ${number.toLocaleString()}`;
}

function truncate(text, length = 140) {
  if (!text) return '';
  return text.length > length ? `${text.slice(0, length).trim()}…` : text;
}


function videoEmbedUrl(input) {
  if (!input) return '';
  try {
    const url = new URL(String(input).trim());
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : '';
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      let id = '';
      if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
      if (url.pathname.startsWith('/shorts/')) id = url.pathname.split('/').filter(Boolean)[1] || '';
      if (url.pathname.startsWith('/embed/')) id = url.pathname.split('/').filter(Boolean)[1] || '';
      return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : '';
    }
    if (host === 'vimeo.com') {
      const id = url.pathname.split('/').filter(Boolean).find(part => /^\d+$/.test(part));
      return id ? `https://player.vimeo.com/video/${encodeURIComponent(id)}` : '';
    }
    if (host === 'player.vimeo.com' && url.pathname.startsWith('/video/')) {
      return url.href;
    }
    return '';
  } catch (err) {
    return '';
  }
}

function slugify(input) {
  return String(input || 'machine')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'machine';
}

async function uniqueSlug(title) {
  const base = slugify(title);
  let slug = base;
  let i = 2;
  while (true) {
    const { rows } = await pool.query('SELECT id FROM machines WHERE slug=$1 LIMIT 1', [slug]);
    if (!rows.length) return slug;
    slug = `${base}-${i++}`;
  }
}

function bool(value) {
  return value === 'on' || value === 'true' || value === true;
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function logAdmin(req, action, entityType, entityId, details = {}) {
  try {
    const adminId = req.session.admin ? req.session.admin.id : null;
    await pool.query(
      'INSERT INTO admin_logs (admin_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
      [adminId, action, entityType, entityId, details]
    );
  } catch (err) {
    console.error('Failed to write admin log:', err.message);
  }
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS machines (
      id SERIAL PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      brand TEXT,
      model TEXT,
      production_year TEXT,
      purchase_year TEXT,
      printhead_type TEXT,
      printhead_count INTEGER,
      working_status TEXT,
      condition_summary TEXT,
      usage_history TEXT,
      known_defects TEXT,
      accessories TEXT,
      asking_price NUMERIC(12,2),
      currency TEXT DEFAULT 'USD',
      price_negotiable BOOLEAN DEFAULT false,
      video_url TEXT,
      details TEXT,
      region TEXT,
      country TEXT,
      city TEXT,
      exact_address TEXT,
      seller_name TEXT NOT NULL,
      seller_company TEXT,
      seller_email TEXT NOT NULL,
      seller_phone TEXT,
      seller_whatsapp TEXT,
      seller_preferred_contact TEXT,
      seller_contact_release_consent BOOLEAN DEFAULT false,
      declaration_accepted BOOLEAN DEFAULT false,
      status TEXT NOT NULL DEFAULT 'pending_review',
      featured BOOLEAN DEFAULT false,
      admin_notes TEXT,
      approved_at TIMESTAMPTZ,
      sold_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_machines_status ON machines(status);
    CREATE INDEX IF NOT EXISTS idx_machines_region ON machines(region);
    CREATE INDEX IF NOT EXISTS idx_machines_country ON machines(country);
    CREATE INDEX IF NOT EXISTS idx_machines_featured ON machines(featured);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_machines_slug_unique ON machines(slug);

    CREATE TABLE IF NOT EXISTS machine_images (
      id SERIAL PRIMARY KEY,
      machine_id INTEGER NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
      image BYTEA NOT NULL,
      mime_type TEXT NOT NULL,
      file_name TEXT,
      is_primary BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_machine_images_machine ON machine_images(machine_id);

    CREATE TABLE IF NOT EXISTS buyer_requests (
      id SERIAL PRIMARY KEY,
      request_type TEXT NOT NULL DEFAULT 'buying',
      machine_id INTEGER REFERENCES machines(id) ON DELETE SET NULL,
      buyer_name TEXT NOT NULL,
      buyer_company TEXT,
      buyer_email TEXT NOT NULL,
      buyer_phone TEXT,
      buyer_whatsapp TEXT,
      buyer_country TEXT,
      target_region TEXT,
      budget TEXT,
      preferred_brand TEXT,
      preferred_printheads TEXT,
      timeline TEXT,
      inspection_plan TEXT,
      shipping_help TEXT,
      message TEXT,
      verification_ack BOOLEAN DEFAULT false,
      status TEXT NOT NULL DEFAULT 'new',
      admin_notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_buyer_requests_status ON buyer_requests(status);
    CREATE INDEX IF NOT EXISTS idx_buyer_requests_type ON buyer_requests(request_type);
    CREATE INDEX IF NOT EXISTS idx_buyer_requests_machine ON buyer_requests(machine_id);

    CREATE TABLE IF NOT EXISTS admin_logs (
      id SERIAL PRIMARY KEY,
      admin_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      details JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS slug TEXT;
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS title TEXT;
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS brand TEXT;
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS model TEXT;
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS production_year TEXT;
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS purchase_year TEXT;
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS printhead_type TEXT;
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS printhead_count INTEGER;
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS working_status TEXT;
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS condition_summary TEXT;
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS usage_history TEXT;
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS known_defects TEXT;
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS accessories TEXT;
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS asking_price NUMERIC(12,2);
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS price_negotiable BOOLEAN DEFAULT false;
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS video_url TEXT;
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS details TEXT;
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS region TEXT;
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS country TEXT;
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS city TEXT;
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS exact_address TEXT;
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS seller_name TEXT;
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS seller_company TEXT;
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS seller_email TEXT;
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS seller_phone TEXT;
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS seller_whatsapp TEXT;
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS seller_preferred_contact TEXT;
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS seller_contact_release_consent BOOLEAN DEFAULT false;
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS declaration_accepted BOOLEAN DEFAULT false;
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending_review';
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT false;
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS admin_notes TEXT;
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ;
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE machines ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    ALTER TABLE machine_images ADD COLUMN IF NOT EXISTS machine_id INTEGER;
    ALTER TABLE machine_images ADD COLUMN IF NOT EXISTS image BYTEA;
    ALTER TABLE machine_images ADD COLUMN IF NOT EXISTS mime_type TEXT;
    ALTER TABLE machine_images ADD COLUMN IF NOT EXISTS file_name TEXT;
    ALTER TABLE machine_images ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false;
    ALTER TABLE machine_images ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    ALTER TABLE buyer_requests ADD COLUMN IF NOT EXISTS contact_shared_at TIMESTAMPTZ;
    ALTER TABLE buyer_requests ADD COLUMN IF NOT EXISTS contact_email_sent_at TIMESTAMPTZ;
    ALTER TABLE buyer_requests ADD COLUMN IF NOT EXISTS contact_email_error TEXT;
    ALTER TABLE buyer_requests ADD COLUMN IF NOT EXISTS matched_machine_ids INTEGER[] DEFAULT '{}'::INTEGER[];
    ALTER TABLE buyer_requests ADD COLUMN IF NOT EXISTS match_shared_at TIMESTAMPTZ;
    ALTER TABLE buyer_requests ADD COLUMN IF NOT EXISTS match_email_sent_at TIMESTAMPTZ;
    ALTER TABLE buyer_requests ADD COLUMN IF NOT EXISTS match_email_error TEXT;
  `);

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@wallprinter.org';
  const adminPassword = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
  const { rows } = await pool.query('SELECT id FROM admin_users WHERE email=$1', [adminEmail]);
  if (!rows.length) {
    const hash = await bcrypt.hash(adminPassword, 12);
    await pool.query('INSERT INTO admin_users (email, password_hash) VALUES ($1,$2)', [adminEmail, hash]);
    console.log(`Created admin user: ${adminEmail}`);
    if (!process.env.ADMIN_PASSWORD) console.log('WARNING: ADMIN_PASSWORD not set. Default password is ChangeMe123! Change it before production use.');
  }
}

async function getMachineWithPrimaryImage(idOrSlug, bySlug = true) {
  const where = bySlug ? 'm.slug=$1' : 'm.id=$1';
  const { rows } = await pool.query(`
    SELECT m.*, img.id AS primary_image_id
    FROM machines m
    LEFT JOIN LATERAL (
      SELECT id FROM machine_images WHERE machine_id=m.id ORDER BY is_primary DESC, id ASC LIMIT 1
    ) img ON true
    WHERE ${where}
    LIMIT 1
  `, [idOrSlug]);
  return rows[0];
}

app.get('/health', (req, res) => res.status(200).json({ ok: true, service: 'Wall Printer Exchange', imageStorage: 'PostgreSQL database', mailConfigured: mailConfigured() }));

app.get('/', async (req, res, next) => {
  try {
    const { region, status, q } = req.query;
    const params = [];
    const clauses = [`m.status IN ('available','reserved','sold')`];
    if (region && REGIONS.includes(region)) {
      params.push(region);
      clauses.push(`m.region=$${params.length}`);
    }
    if (status && ['available', 'reserved', 'sold'].includes(status)) {
      params.push(status);
      clauses.push(`m.status=$${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      clauses.push(`(m.title ILIKE $${params.length} OR m.brand ILIKE $${params.length} OR m.model ILIKE $${params.length} OR m.country ILIKE $${params.length} OR m.city ILIKE $${params.length})`);
    }
    const { rows: machines } = await pool.query(`
      SELECT m.*, img.id AS primary_image_id
      FROM machines m
      LEFT JOIN LATERAL (
        SELECT id FROM machine_images WHERE machine_id=m.id ORDER BY is_primary DESC, id ASC LIMIT 1
      ) img ON true
      WHERE ${clauses.join(' AND ')}
      ORDER BY m.featured DESC, CASE m.status WHEN 'available' THEN 1 WHEN 'reserved' THEN 2 WHEN 'sold' THEN 3 ELSE 4 END, m.created_at DESC
    `, params);

    const { rows: stats } = await pool.query(`
      SELECT region, COUNT(*)::int AS count
      FROM machines
      WHERE status IN ('available','reserved','sold') AND region IS NOT NULL AND region <> ''
      GROUP BY region
      ORDER BY region
    `);

    res.render('public/index', {
      title: translate(req.lang, 'seo.home.title'),
      metaDescription: translate(req.lang, 'seo.home.desc'),
      canonicalUrl: localizedAbsolute('/', req.lang),
      machines,
      stats,
      filters: { region, status, q }
    });
  } catch (err) {
    next(err);
  }
});


app.get('/about', (req, res) => {
  res.render('public/about', {
    title: translate(req.lang, 'seo.about.title'),
    metaDescription: 'Wall Printer Exchange is a focused used wall printer introduction platform for reviewed machine listings, private seller contact release, and buyer-led verification.',
    canonicalUrl: localizedAbsolute('/about', req.lang)
  });
});

app.get('/buyer-guide', (req, res) => {
  res.render('public/buyer-guide', {
    title: translate(req.lang, 'seo.buyer.title'),
    metaDescription: 'A practical buyer guide for used wall printer inspection, seller contact requests, ownership checks, printhead verification, payment terms, and logistics planning.',
    canonicalUrl: localizedAbsolute('/buyer-guide', req.lang)
  });
});

app.get('/seller-guide', (req, res) => {
  res.render('public/seller-guide', {
    title: translate(req.lang, 'seo.seller.title'),
    metaDescription: 'How sellers can submit used wall printer photos, machine condition details, location, asking price, and private contact information for admin review.',
    canonicalUrl: localizedAbsolute('/seller-guide', req.lang)
  });
});

app.get('/verification-checklist', (req, res) => {
  res.render('public/checklist', {
    title: translate(req.lang, 'seo.check.title'),
    metaDescription: 'Use this checklist to verify used wall printer ownership, printheads, condition, accessories, payment terms, shipping, customs, and logistics before purchase.',
    canonicalUrl: localizedAbsolute('/verification-checklist', req.lang)
  });
});

app.get('/inspection-checklist', (req, res) => {
  res.redirect(301, localizedPath('/verification-checklist', req.lang));
});

app.get('/machine/:slug', async (req, res, next) => {
  try {
    const machine = await getMachineWithPrimaryImage(req.params.slug, true);
    if (!machine || !['available', 'reserved', 'sold'].includes(machine.status)) return res.status(404).render('public/404', { title: 'Listing not found' });
    const { rows: images } = await pool.query('SELECT id, is_primary FROM machine_images WHERE machine_id=$1 ORDER BY is_primary DESC, id ASC', [machine.id]);
    const { rows: navMachines } = await pool.query(`
      SELECT id, title, slug, status
      FROM machines
      WHERE status IN ('available','reserved','sold')
      ORDER BY featured DESC, CASE status WHEN 'available' THEN 1 WHEN 'reserved' THEN 2 WHEN 'sold' THEN 3 ELSE 4 END, created_at DESC
    `);
    const currentIndex = navMachines.findIndex(item => Number(item.id) === Number(machine.id));
    const prevMachine = currentIndex > 0 ? navMachines[currentIndex - 1] : null;
    const nextMachine = currentIndex >= 0 && currentIndex < navMachines.length - 1 ? navMachines[currentIndex + 1] : null;
    res.render('public/machine', {
      title: machine.title,
      metaDescription: `${machine.title} ${[machine.region, machine.country, machine.city].filter(Boolean).join(' · ')} ${money(machine.asking_price, machine.currency)}. Used wall printer listing with buyer-led verification.`,
      canonicalUrl: localizedAbsolute(`/machine/${machine.slug}`, req.lang),
      ogType: 'product',
      ogImage: images[0] ? imageUrl(images[0].id) : '',
      machine, images, prevMachine, nextMachine
    });
  } catch (err) {
    next(err);
  }
});

app.get('/submit-machine', (req, res) => {
  res.render('public/submit-machine', { title: 'Submit Your Machine', form: {}, errors: [] });
});

app.post('/submit-machine', machineUpload, async (req, res, next) => {
  const f = req.body;
  const errors = [];
  if (!bool(f.declaration_accepted)) errors.push('You must accept the listing declaration before submitting.');
  if (!bool(f.seller_contact_release_consent)) errors.push('You must allow us to share your contact information with qualified buyers after admin review.');
  ['title', 'seller_name', 'seller_email', 'region', 'country', 'city'].forEach(field => {
    if (!f[field] || !String(f[field]).trim()) errors.push(`${field.replace(/_/g, ' ')} is required.`);
  });
  if (f.region && !REGIONS.includes(f.region)) errors.push('Please select a valid region.');

  if (errors.length) return res.status(400).render('public/submit-machine', { title: 'Submit Your Machine', form: f, errors });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const slug = await uniqueSlug(f.title);
    const { rows } = await client.query(`
      INSERT INTO machines (
        slug,title,brand,model,production_year,purchase_year,printhead_type,printhead_count,
        working_status,condition_summary,usage_history,known_defects,accessories,asking_price,currency,
        price_negotiable,video_url,details,region,country,city,exact_address,seller_name,seller_company,
        seller_email,seller_phone,seller_whatsapp,seller_preferred_contact,seller_contact_release_consent,declaration_accepted
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30
      ) RETURNING id
    `, [
      slug, f.title, f.brand || null, f.model || null, f.production_year || null, f.purchase_year || null,
      f.printhead_type || null, numberOrNull(f.printhead_count), f.working_status || null, null,
      null, f.known_defects || null, f.accessories || null, numberOrNull(f.asking_price), f.currency || 'USD',
      bool(f.price_negotiable), f.video_url || null, f.details || null, f.region, f.country, f.city, f.exact_address || null,
      f.seller_name, f.seller_company || null, f.seller_email, f.seller_phone || null, f.seller_whatsapp || null,
      f.seller_preferred_contact || null, bool(f.seller_contact_release_consent), bool(f.declaration_accepted)
    ]);
    const machineId = rows[0].id;
    const files = req.files || [];
    for (let i = 0; i < files.length; i++) {
      await client.query('INSERT INTO machine_images (machine_id, image, mime_type, file_name, is_primary) VALUES ($1,$2,$3,$4,$5)', [machineId, files[i].buffer, files[i].mimetype, files[i].originalname, i === 0]);
    }
    await client.query('COMMIT');
    res.render('public/submit-success', { title: 'Submission Received', type: 'machine' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

app.get('/buying-request', (req, res) => {
  res.render('public/buying-request', { title: 'Submit Buying Request', form: {}, errors: [], machine: null });
});

app.post('/buying-request', async (req, res, next) => {
  try {
    const f = req.body;
    const errors = [];
    ['buyer_name', 'buyer_email', 'buyer_country'].forEach(field => {
      if (!f[field] || !String(f[field]).trim()) errors.push(`${field.replace(/_/g, ' ')} is required.`);
    });
    if (!bool(f.verification_ack)) errors.push('You must acknowledge that buyers are responsible for verification.');
    if (f.target_region && !REGIONS.includes(f.target_region)) errors.push('Please select a valid target region.');
    if (errors.length) return res.status(400).render('public/buying-request', { title: 'Submit Buying Request', form: f, errors, machine: null });

    await pool.query(`
      INSERT INTO buyer_requests (
        request_type,buyer_name,buyer_company,buyer_email,buyer_phone,buyer_whatsapp,buyer_country,
        target_region,budget,preferred_brand,preferred_printheads,timeline,inspection_plan,shipping_help,message,verification_ack
      ) VALUES ('buying',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    `, [
      f.buyer_name, f.buyer_company || null, f.buyer_email, f.buyer_phone || null, f.buyer_whatsapp || null,
      f.buyer_country, f.target_region || null, f.budget || null, f.preferred_brand || null, f.preferred_printheads || null,
      f.timeline || null, f.inspection_plan || null, null, f.message || null, bool(f.verification_ack)
    ]);
    res.render('public/submit-success', { title: 'Buying Request Received', type: 'buying' });
  } catch (err) {
    next(err);
  }
});

app.get('/machine/:slug/request-contact', async (req, res, next) => {
  try {
    const machine = await getMachineWithPrimaryImage(req.params.slug, true);
    if (!machine || !['available', 'reserved'].includes(machine.status)) return res.status(404).render('public/404', { title: 'Listing not available' });
    res.render('public/request-contact', { title: 'Request Seller Contact', machine, form: {}, errors: [] });
  } catch (err) {
    next(err);
  }
});

app.post('/machine/:slug/request-contact', async (req, res, next) => {
  try {
    const machine = await getMachineWithPrimaryImage(req.params.slug, true);
    if (!machine || !['available', 'reserved'].includes(machine.status)) return res.status(404).render('public/404', { title: 'Listing not available' });
    const f = req.body;
    const errors = [];
    ['buyer_name', 'buyer_email', 'buyer_country'].forEach(field => {
      if (!f[field] || !String(f[field]).trim()) errors.push(`${field.replace(/_/g, ' ')} is required.`);
    });
    if (!bool(f.verification_ack)) errors.push('You must acknowledge the buyer verification responsibility.');
    if (errors.length) return res.status(400).render('public/request-contact', { title: 'Request Seller Contact', machine, form: f, errors });

    await pool.query(`
      INSERT INTO buyer_requests (
        request_type,machine_id,buyer_name,buyer_company,buyer_email,buyer_phone,buyer_whatsapp,buyer_country,
        timeline,inspection_plan,shipping_help,message,verification_ack
      ) VALUES ('contact',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    `, [
      machine.id, f.buyer_name, f.buyer_company || null, f.buyer_email, f.buyer_phone || null, f.buyer_whatsapp || null,
      f.buyer_country, f.timeline || null, f.inspection_plan || null, null, f.message || null, bool(f.verification_ack)
    ]);
    res.render('public/submit-success', { title: 'Contact Request Received', type: 'contact', machine });
  } catch (err) {
    next(err);
  }
});

app.get('/images/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT image, mime_type FROM machine_images WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).send('Image not found');
    res.setHeader('Content-Type', rows[0].mime_type);
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.setHeader('X-Image-Storage', 'postgres-bytea');
    res.send(rows[0].image);
  } catch (err) {
    next(err);
  }
});

app.get('/healthz', (req, res) => {
  res.json({ ok: true, service: 'wall-printer-exchange', version: '3.8' });
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nSitemap: ${absoluteUrl('/sitemap.xml')}\n`);
});

app.get('/sitemap.xml', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT slug, updated_at
      FROM machines
      WHERE status IN ('available','reserved','sold')
      ORDER BY updated_at DESC
      LIMIT 500
    `);
    const baseLastmod = new Date().toISOString();
    const staticPaths = ['/', '/about', '/buyer-guide', '/seller-guide', '/verification-checklist'];
    const urls = [
      ...LANGUAGES.flatMap(language => staticPaths.map(pathname => ({ loc: localizedAbsolute(pathname, language.code), lastmod: baseLastmod }))),
      ...LANGUAGES.flatMap(language => rows.map(row => ({ loc: localizedAbsolute(`/machine/${row.slug}`, language.code), lastmod: new Date(row.updated_at || Date.now()).toISOString() })))
    ];
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${escapeXml(u.loc)}</loc><lastmod>${escapeXml(u.lastmod)}</lastmod></url>`).join('\n')}
</urlset>`;
    res.type('application/xml').send(body);
  } catch (err) {
    next(err);
  }
});

app.get('/admin/login', (req, res) => {
  if (req.session.admin) return res.redirect('/admin');
  res.render('admin/login', { title: 'Admin Login', error: null });
});

app.post('/admin/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const { rows } = await pool.query('SELECT * FROM admin_users WHERE email=$1 LIMIT 1', [email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password || '', user.password_hash))) {
      return res.status(401).render('admin/login', { title: 'Admin Login', error: 'Invalid email or password.' });
    }
    req.session.admin = { id: user.id, email: user.email, role: user.role };
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

app.get('/admin', requireAdmin, async (req, res, next) => {
  try {
    const [machineCounts, requestCounts, recentMachines, recentRequests] = await Promise.all([
      pool.query('SELECT status, COUNT(*)::int AS count FROM machines GROUP BY status'),
      pool.query('SELECT status, COUNT(*)::int AS count FROM buyer_requests GROUP BY status'),
      pool.query('SELECT id, title, status, region, country, city, created_at FROM machines ORDER BY created_at DESC LIMIT 8'),
      pool.query(`SELECT br.*, m.title AS machine_title FROM buyer_requests br LEFT JOIN machines m ON br.machine_id=m.id ORDER BY br.created_at DESC LIMIT 8`)
    ]);
    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      machineCounts: machineCounts.rows,
      requestCounts: requestCounts.rows,
      recentMachines: recentMachines.rows,
      recentRequests: recentRequests.rows
    });
  } catch (err) {
    next(err);
  }
});

app.post('/admin/email/test', requireAdmin, async (req, res, next) => {
  try {
    const to = (req.body && req.body.to) || process.env.ADMIN_EMAIL || (req.session.admin && req.session.admin.email);
    if (!to) {
      flash(req, 'error', 'No test recipient is available. Set ADMIN_EMAIL first.');
      return res.redirect('/admin');
    }
    const result = await sendMail({
      to,
      subject: 'Wall Printer Exchange email test',
      text: `This is a test email from Wall Printer Exchange.

If you received this, your Railway and Resend email configuration is working.`,
      html: emailLayout({
        title: 'Email test successful',
        preheader: 'Your Railway and Resend email configuration is working.',
        body: `<p style="margin:0 0 16px;">This is a test email from <strong>Wall Printer Exchange</strong>.</p><p style="margin:0;">If you received this, your Railway and Resend email configuration is working.</p>`,
        ctaUrl: absoluteUrl('/admin'),
        ctaLabel: 'Open admin dashboard'
      })
    });
    if (result.sent) flash(req, 'success', `Test email sent to ${to}.`);
    else flash(req, 'error', `Test email failed: ${result.reason || 'Email provider not configured'}.`);
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

app.get('/admin/machines', requireAdmin, async (req, res, next) => {
  try {
    const { status, region, q } = req.query;
    const params = [];
    const clauses = [];
    if (status && MACHINE_STATUSES.includes(status)) { params.push(status); clauses.push(`m.status=$${params.length}`); }
    if (region && REGIONS.includes(region)) { params.push(region); clauses.push(`m.region=$${params.length}`); }
    if (q) {
      params.push(`%${q}%`);
      clauses.push(`(m.title ILIKE $${params.length} OR m.seller_name ILIKE $${params.length} OR m.seller_email ILIKE $${params.length} OR m.country ILIKE $${params.length})`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows: machines } = await pool.query(`
      SELECT m.*, img.id AS primary_image_id
      FROM machines m
      LEFT JOIN LATERAL (
        SELECT id FROM machine_images WHERE machine_id=m.id ORDER BY is_primary DESC, id ASC LIMIT 1
      ) img ON true
      ${where}
      ORDER BY m.created_at DESC
    `, params);
    res.render('admin/machines', { title: 'Manage Machines', machines, filters: { status, region, q } });
  } catch (err) {
    next(err);
  }
});


app.get('/admin/machines/:id/preview', requireAdmin, async (req, res, next) => {
  try {
    const machine = await getMachineWithPrimaryImage(req.params.id, false);
    if (!machine) return res.status(404).render('public/404', { title: 'Listing not found' });
    const { rows: images } = await pool.query('SELECT id, is_primary FROM machine_images WHERE machine_id=$1 ORDER BY is_primary DESC, id ASC', [machine.id]);
    res.render('public/machine', { title: `Preview - ${machine.title}`, machine, images, previewMode: true });
  } catch (err) {
    next(err);
  }
});

app.get('/admin/machines/:id/edit', requireAdmin, async (req, res, next) => {
  try {
    const machine = await getMachineWithPrimaryImage(req.params.id, false);
    if (!machine) return res.status(404).render('public/404', { title: 'Machine not found' });
    const { rows: images } = await pool.query('SELECT id, file_name, is_primary, created_at FROM machine_images WHERE machine_id=$1 ORDER BY is_primary DESC, id ASC', [machine.id]);
    res.render('admin/edit-machine', { title: `Edit ${machine.title}`, machine, images, errors: [] });
  } catch (err) {
    next(err);
  }
});

app.post('/admin/machines/:id/edit', requireAdmin, upload.array('new_images', MAX_UPLOAD_IMAGES), async (req, res, next) => {
  const f = req.body;
  const id = req.params.id;
  const errors = [];
  if (!f.title) errors.push('Title is required.');
  if (f.status && !MACHINE_STATUSES.includes(f.status)) errors.push('Invalid status.');
  if (f.region && !REGIONS.includes(f.region)) errors.push('Invalid region.');
  if (errors.length) {
    const machine = await getMachineWithPrimaryImage(id, false);
    const { rows: images } = await pool.query('SELECT id, file_name, is_primary, created_at FROM machine_images WHERE machine_id=$1 ORDER BY is_primary DESC, id ASC', [id]);
    return res.status(400).render('admin/edit-machine', { title: `Edit ${machine.title}`, machine: { ...machine, ...f }, images, errors });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const old = await client.query('SELECT status FROM machines WHERE id=$1', [id]);
    if (!old.rows.length) throw new Error('Machine not found.');
    const previousStatus = old.rows[0].status;
    await client.query(`
      UPDATE machines SET
        title=$1, brand=$2, model=$3, production_year=$4, purchase_year=$5, printhead_type=$6,
        printhead_count=$7, working_status=$8, condition_summary=$9, usage_history=$10, known_defects=$11,
        accessories=$12, asking_price=$13, currency=$14, price_negotiable=$15, video_url=$16, details=$17,
        region=$18, country=$19, city=$20, exact_address=$21, seller_name=$22, seller_company=$23,
        seller_email=$24, seller_phone=$25, seller_whatsapp=$26, seller_preferred_contact=$27,
        status=$28, featured=$29, admin_notes=$30,
        approved_at=CASE WHEN $28='available' AND approved_at IS NULL THEN NOW() ELSE approved_at END,
        sold_at=CASE WHEN $28='sold' AND sold_at IS NULL THEN NOW() WHEN $28<>'sold' THEN NULL ELSE sold_at END,
        updated_at=NOW()
      WHERE id=$31
    `, [
      f.title, f.brand || null, f.model || null, f.production_year || null, f.purchase_year || null,
      f.printhead_type || null, numberOrNull(f.printhead_count), f.working_status || null, null,
      null, f.known_defects || null, f.accessories || null, numberOrNull(f.asking_price), f.currency || 'USD',
      bool(f.price_negotiable), f.video_url || null, f.details || null, f.region || null, f.country || null, f.city || null,
      f.exact_address || null, f.seller_name || '', f.seller_company || null, f.seller_email || '', f.seller_phone || null,
      f.seller_whatsapp || null, f.seller_preferred_contact || null, f.status || previousStatus, bool(f.featured), f.admin_notes || null, id
    ]);
    const files = req.files || [];
    const existing = await client.query('SELECT COUNT(*)::int AS count FROM machine_images WHERE machine_id=$1', [id]);
    let count = existing.rows[0].count;
    for (const file of files) {
      await client.query('INSERT INTO machine_images (machine_id, image, mime_type, file_name, is_primary) VALUES ($1,$2,$3,$4,$5)', [id, file.buffer, file.mimetype, file.originalname, count === 0]);
      count += 1;
    }
    await client.query('COMMIT');
    await logAdmin(req, 'machine_updated', 'machine', Number(id), { previousStatus, newStatus: f.status });
    flash(req, 'success', 'Machine listing updated.');
    res.redirect(`/admin/machines/${id}/edit`);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

app.post('/admin/machines/:id/status', requireAdmin, async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!MACHINE_STATUSES.includes(status)) throw new Error('Invalid status.');
    await pool.query(`
      UPDATE machines SET status=$1,
        approved_at=CASE WHEN $1='available' AND approved_at IS NULL THEN NOW() ELSE approved_at END,
        sold_at=CASE WHEN $1='sold' AND sold_at IS NULL THEN NOW() WHEN $1<>'sold' THEN NULL ELSE sold_at END,
        updated_at=NOW()
      WHERE id=$2
    `, [status, req.params.id]);
    await logAdmin(req, 'machine_status_changed', 'machine', Number(req.params.id), { status });
    flash(req, 'success', `Machine marked as ${statusLabel(status)}.`);
    res.redirect(req.get('referer') || '/admin/machines');
  } catch (err) {
    next(err);
  }
});

app.post('/admin/machines/:id/delete', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query('DELETE FROM machines WHERE id=$1 RETURNING id, title', [req.params.id]);
    if (!rows.length) {
      flash(req, 'error', 'Machine not found or already deleted.');
      return res.redirect('/admin/machines');
    }
    await logAdmin(req, 'machine_deleted', 'machine', Number(req.params.id), { title: rows[0].title });
    flash(req, 'success', `Deleted machine listing: ${rows[0].title}.`);
    res.redirect('/admin/machines');
  } catch (err) {
    next(err);
  }
});

app.post('/admin/images/:id/delete', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query('DELETE FROM machine_images WHERE id=$1 RETURNING machine_id', [req.params.id]);
    if (rows[0]) await logAdmin(req, 'image_deleted', 'machine', rows[0].machine_id, { imageId: req.params.id });
    flash(req, 'success', 'Image deleted.');
    res.redirect(req.get('referer') || '/admin/machines');
  } catch (err) {
    next(err);
  }
});

app.get('/admin/requests', requireAdmin, async (req, res, next) => {
  try {
    const { status, type, q } = req.query;
    const params = [];
    const clauses = [];
    if (status && REQUEST_STATUSES.includes(status)) { params.push(status); clauses.push(`br.status=$${params.length}`); }
    if (type && ['buying', 'contact'].includes(type)) { params.push(type); clauses.push(`br.request_type=$${params.length}`); }
    if (q) {
      params.push(`%${q}%`);
      clauses.push(`(br.buyer_name ILIKE $${params.length} OR br.buyer_email ILIKE $${params.length} OR br.buyer_country ILIKE $${params.length} OR m.title ILIKE $${params.length})`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows: requests } = await pool.query(`
      SELECT br.*, m.title AS machine_title, m.slug AS machine_slug, m.region AS machine_region, m.country AS machine_country
      FROM buyer_requests br
      LEFT JOIN machines m ON br.machine_id=m.id
      ${where}
      ORDER BY br.created_at DESC
    `, params);
    res.render('admin/requests', { title: 'Buyer Requests', requests, filters: { status, type, q } });
  } catch (err) {
    next(err);
  }
});

app.get('/admin/requests/:id', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT br.*, m.title AS machine_title, m.slug AS machine_slug, m.seller_name, m.seller_company,
             m.seller_email, m.seller_phone, m.seller_whatsapp, m.seller_preferred_contact,
             m.exact_address, m.seller_contact_release_consent, m.region AS machine_region, m.country AS machine_country, m.city AS machine_city
      FROM buyer_requests br
      LEFT JOIN machines m ON br.machine_id=m.id
      WHERE br.id=$1
    `, [req.params.id]);
    if (!rows.length) return res.status(404).render('public/404', { title: 'Request not found' });
    const request = rows[0];
    let candidateMachines = [];
    let matchedMachines = [];
    if (request.request_type === 'buying') {
      const { rows: candidates } = await pool.query(`
        SELECT m.*, img.id AS primary_image_id
        FROM machines m
        LEFT JOIN LATERAL (
          SELECT id FROM machine_images WHERE machine_id=m.id ORDER BY is_primary DESC, id ASC LIMIT 1
        ) img ON true
        WHERE m.status IN ('available','reserved')
        ORDER BY m.featured DESC, m.created_at DESC
        LIMIT 50
      `);
      candidateMachines = candidates;
      if (request.matched_machine_ids && request.matched_machine_ids.length) {
        const { rows: matched } = await pool.query(`
          SELECT m.*, img.id AS primary_image_id
          FROM machines m
          LEFT JOIN LATERAL (
            SELECT id FROM machine_images WHERE machine_id=m.id ORDER BY is_primary DESC, id ASC LIMIT 1
          ) img ON true
          WHERE m.id = ANY($1::int[])
          ORDER BY array_position($1::int[], m.id)
        `, [request.matched_machine_ids]);
        matchedMachines = matched;
      }
    }
    res.render('admin/request-detail', { title: 'Buyer Request Detail', request, candidateMachines, matchedMachines });
  } catch (err) {
    next(err);
  }
});

app.post('/admin/requests/:id/update', requireAdmin, async (req, res, next) => {
  try {
    const { status, admin_notes } = req.body;
    if (!REQUEST_STATUSES.includes(status)) throw new Error('Invalid request status.');

    const { rows } = await pool.query(`
      SELECT br.*, m.title AS machine_title, m.slug AS machine_slug, m.seller_name, m.seller_company,
             m.seller_email, m.seller_phone, m.seller_whatsapp, m.seller_preferred_contact,
             m.exact_address, m.seller_contact_release_consent, m.region AS machine_region,
             m.country AS machine_country, m.city AS machine_city
      FROM buyer_requests br
      LEFT JOIN machines m ON br.machine_id=m.id
      WHERE br.id=$1
    `, [req.params.id]);
    if (!rows.length) return res.status(404).render('public/404', { title: 'Request not found' });

    const requestBefore = rows[0];
    let emailResult = null;

    await pool.query(`
      UPDATE buyer_requests SET
        status=$1,
        admin_notes=$2,
        contact_shared_at=CASE WHEN $1='contact_shared' AND contact_shared_at IS NULL THEN NOW() ELSE contact_shared_at END,
        updated_at=NOW()
      WHERE id=$3
    `, [status, admin_notes || null, req.params.id]);

    if (status === 'contact_shared' && requestBefore.status !== 'contact_shared' && requestBefore.request_type === 'contact') {
      emailResult = await sendContactReleaseEmails({ ...requestBefore, status });
      await pool.query(`
        UPDATE buyer_requests SET
          contact_email_sent_at=CASE WHEN $1=true THEN NOW() ELSE contact_email_sent_at END,
          contact_email_error=$2
        WHERE id=$3
      `, [Boolean(emailResult.sent), emailResult.sent ? null : emailResult.reason || 'Email not sent', req.params.id]);
    }

    await logAdmin(req, 'buyer_request_updated', 'buyer_request', Number(req.params.id), { status, emailResult });

    if (emailResult && emailResult.sent) {
      flash(req, 'success', 'Buyer request updated and seller contact email sent with the verification checklist.');
    } else if (emailResult && !emailResult.sent) {
      flash(req, 'success', `Buyer request updated. Email was not sent: ${emailResult.reason || 'SMTP not configured'}.`);
    } else {
      flash(req, 'success', 'Buyer request updated.');
    }
    res.redirect(`/admin/requests/${req.params.id}`);
  } catch (err) {
    next(err);
  }
});


app.post('/admin/requests/:id/delete', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query('DELETE FROM buyer_requests WHERE id=$1 RETURNING id, buyer_name, buyer_email, request_type', [req.params.id]);
    if (!rows.length) {
      flash(req, 'error', 'Buyer request not found or already deleted.');
      return res.redirect('/admin/requests');
    }
    await logAdmin(req, 'buyer_request_deleted', 'buyer_request', Number(req.params.id), { buyer: rows[0].buyer_name, email: rows[0].buyer_email, type: rows[0].request_type });
    flash(req, 'success', `Deleted buyer request from ${rows[0].buyer_name || rows[0].buyer_email}.`);
    res.redirect('/admin/requests');
  } catch (err) {
    next(err);
  }
});

app.post('/admin/requests/:id/match', requireAdmin, async (req, res, next) => {
  try {
    let machineIds = req.body.machine_ids || [];
    if (!Array.isArray(machineIds)) machineIds = machineIds ? [machineIds] : [];
    machineIds = machineIds.map(id => Number(id)).filter(Number.isInteger);
    machineIds = [...new Set(machineIds)].slice(0, 5);

    if (!machineIds.length) {
      flash(req, 'error', 'Select at least one machine to match.');
      return res.redirect(`/admin/requests/${req.params.id}`);
    }
    if (machineIds.length > 5) throw new Error('You can match up to 5 machines only.');

    const { rows } = await pool.query('SELECT * FROM buyer_requests WHERE id=$1 LIMIT 1', [req.params.id]);
    const request = rows[0];
    if (!request || request.request_type !== 'buying') return res.status(404).render('public/404', { title: 'Buying request not found' });

    const { rows: machines } = await pool.query(`
      SELECT * FROM machines
      WHERE id = ANY($1::int[]) AND status IN ('available','reserved')
      ORDER BY array_position($1::int[], id)
    `, [machineIds]);

    if (!machines.length) {
      flash(req, 'error', 'No available or reserved machines were found for the selected IDs.');
      return res.redirect(`/admin/requests/${req.params.id}`);
    }

    const emailResult = await sendManualMatchEmails(request, machines);
    await pool.query(`
      UPDATE buyer_requests SET
        status='matched',
        matched_machine_ids=$1::int[],
        match_shared_at=NOW(),
        match_email_sent_at=CASE WHEN $2=true THEN NOW() ELSE match_email_sent_at END,
        match_email_error=$3,
        updated_at=NOW()
      WHERE id=$4
    `, [machines.map(m => m.id), Boolean(emailResult.sent), emailResult.sent ? null : emailResult.reason || 'Email not sent', req.params.id]);

    await logAdmin(req, 'machines_matched_to_buyer', 'buyer_request', Number(req.params.id), { machineIds: machines.map(m => m.id), emailResult });
    if (emailResult.sent) flash(req, 'success', `Matched ${machines.length} machine(s) and sent introduction email(s).`);
    else flash(req, 'success', `Matched ${machines.length} machine(s). Email was not sent: ${emailResult.reason || 'SMTP not configured'}.`);
    res.redirect(`/admin/requests/${req.params.id}`);
  } catch (err) {
    next(err);
  }
});

app.get('/admin/logs', requireAdmin, (req, res) => res.redirect('/admin'));

app.use((req, res) => {
  res.status(404).render('public/404', { title: 'Page not found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (err instanceof multer.MulterError || /image/i.test(err.message || '')) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'One or more images are too large. Each image must be 2MB or smaller.'
      : err.code === 'LIMIT_FILE_COUNT'
        ? `You can upload up to ${MAX_UPLOAD_IMAGES} images.`
        : err.message || 'Image upload failed.';
    return res.status(400).render('public/error', { title: 'Upload Error', message });
  }
  const message = process.env.NODE_ENV === 'production' ? 'Something went wrong.' : err.message;
  res.status(500).render('public/error', { title: 'Server Error', message });
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Wall Printer Exchange running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
