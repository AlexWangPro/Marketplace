require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const slugify = require('slugify');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const DATABASE_URL = process.env.DATABASE_URL;
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@wallprinter.org';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL. Add a PostgreSQL database and set DATABASE_URL.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Only JPG, PNG, WEBP, or GIF images are allowed.'));
    }
    cb(null, true);
  },
});

function imageToDataUrl(file) {
  return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
}

function safeTrim(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function makeSlug(input) {
  const base = slugify(safeTrim(input), { lower: true, strict: true });
  return base || crypto.randomBytes(5).toString('hex');
}

async function uniqueProductSlug(title, existingId = null) {
  const base = makeSlug(title);
  let slug = base;
  let counter = 2;
  while (true) {
    const params = existingId ? [slug, existingId] : [slug];
    const sql = existingId
      ? 'SELECT id FROM products WHERE slug = $1 AND id <> $2 LIMIT 1'
      : 'SELECT id FROM products WHERE slug = $1 LIMIT 1';
    const found = await pool.query(sql, params);
    if (found.rowCount === 0) return slug;
    slug = `${base}-${counter++}`;
  }
}

function formatDate(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: '2-digit' }).format(new Date(date));
}

function shortText(text, max = 140) {
  const value = safeTrim(text);
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function money(value, currency = 'USD') {
  if (value === null || value === undefined || value === '') return 'Price on request';
  const number = Number(value);
  if (Number.isNaN(number)) return 'Price on request';
  return `${currency || 'USD'} ${number.toLocaleString()}`;
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    req.flash('error', 'Please log in first.');
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    req.flash('error', 'Admin access required.');
    return res.redirect('/login');
  }
  next();
}

function ensureActive(req, res, next) {
  if (req.session.user && req.session.user.status === 'disabled') {
    req.session.destroy(() => res.redirect('/login'));
    return;
  }
  next();
}

async function getCurrentUser(userId) {
  if (!userId) return null;
  const result = await pool.query('SELECT id, name, email, role, status, created_at FROM users WHERE id = $1', [userId]);
  return result.rows[0] || null;
}

async function logAdmin(adminId, action, targetType, targetId, details = {}) {
  await pool.query(
    'INSERT INTO admin_logs (admin_user_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5)',
    [adminId, action, targetType, targetId, JSON.stringify(details)]
  );
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      summary TEXT,
      description TEXT NOT NULL,
      price NUMERIC(12,2),
      currency TEXT DEFAULT 'USD',
      location TEXT,
      company TEXT,
      contact_email TEXT,
      whatsapp TEXT,
      website TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'archived')),
      rejection_reason TEXT,
      views INTEGER NOT NULL DEFAULT 0,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS product_images (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      image_data_url TEXT NOT NULL,
      alt_text TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS inquiries (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS admin_logs (
      id SERIAL PRIMARY KEY,
      admin_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id INTEGER,
      details JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_products_status_created ON products(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_products_user ON products(user_id);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_inquiries_product ON inquiries(product_id, created_at DESC);
  `);

  const defaults = ['Wall Printers', 'Floor Printers', 'UV Printers', 'Printing Materials', 'Accessories', 'Services'];
  for (const name of defaults) {
    await pool.query(
      'INSERT INTO categories (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING',
      [name, makeSlug(name)]
    );
  }

  const adminExists = await pool.query('SELECT id FROM users WHERE role = $1 LIMIT 1', ['admin']);
  if (adminExists.rowCount === 0) {
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO UPDATE SET role = $4, password_hash = $3, status = $5',
      ['Admin', ADMIN_EMAIL.toLowerCase(), hash, 'admin', 'active']
    );
    console.log(`Seeded admin user: ${ADMIN_EMAIL}. Change ADMIN_PASSWORD after first deployment.`);
  }
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));
app.use(express.json({ limit: '8mb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 250, standardHeaders: true, legacyHeaders: false }));
app.use(session({
  store: new PgSession({ pool, createTableIfMissing: true }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 14,
  },
}));

app.use((req, res, next) => {
  req.flash = (type, message) => {
    req.session.flash = req.session.flash || [];
    req.session.flash.push({ type, message });
  };
  res.locals.flash = req.session.flash || [];
  req.session.flash = [];
  res.locals.user = req.session.user || null;
  res.locals.path = req.path;
  res.locals.formatDate = formatDate;
  res.locals.shortText = shortText;
  res.locals.money = money;
  res.locals.appUrl = APP_URL;
  next();
});

app.use(async (req, res, next) => {
  if (req.session.user) {
    const fresh = await getCurrentUser(req.session.user.id);
    if (!fresh || fresh.status === 'disabled') {
      req.session.destroy(() => res.redirect('/login'));
      return;
    }
    req.session.user = fresh;
    res.locals.user = fresh;
  }
  next();
});
app.use(ensureActive);

async function loadCategories() {
  const result = await pool.query('SELECT * FROM categories ORDER BY name ASC');
  return result.rows;
}

async function productWithImages(idOrSlug, publicOnly = false) {
  const where = Number.isInteger(Number(idOrSlug)) ? 'p.id = $1' : 'p.slug = $1';
  const statusSql = publicOnly ? " AND p.status = 'approved'" : '';
  const result = await pool.query(`
    SELECT p.*, c.name AS category_name, c.slug AS category_slug, u.name AS seller_name, u.email AS seller_email
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    JOIN users u ON u.id = p.user_id
    WHERE ${where}${statusSql}
    LIMIT 1
  `, [idOrSlug]);
  const product = result.rows[0];
  if (!product) return null;
  const images = await pool.query('SELECT * FROM product_images WHERE product_id = $1 ORDER BY sort_order ASC, id ASC', [product.id]);
  product.images = images.rows;
  return product;
}

app.get('/', async (req, res, next) => {
  try {
    const [featured, categories, counts] = await Promise.all([
      pool.query(`
        SELECT p.*, c.name AS category_name,
          (SELECT image_data_url FROM product_images WHERE product_id = p.id ORDER BY sort_order ASC, id ASC LIMIT 1) AS image
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.status = 'approved'
        ORDER BY p.published_at DESC NULLS LAST, p.created_at DESC
        LIMIT 8
      `),
      loadCategories(),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'approved') AS approved,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending,
          COUNT(*) AS total
        FROM products
      `),
    ]);
    res.render('home', { title: 'Wall Printer Product Marketplace', featured: featured.rows, categories, counts: counts.rows[0] });
  } catch (error) {
    next(error);
  }
});

app.get('/products', async (req, res, next) => {
  try {
    const search = safeTrim(req.query.search);
    const category = safeTrim(req.query.category);
    const params = [];
    const where = ["p.status = 'approved'"];
    if (search) {
      params.push(`%${search}%`);
      where.push(`(p.title ILIKE $${params.length} OR p.summary ILIKE $${params.length} OR p.description ILIKE $${params.length} OR p.company ILIKE $${params.length})`);
    }
    if (category) {
      params.push(category);
      where.push(`c.slug = $${params.length}`);
    }
    const products = await pool.query(`
      SELECT p.*, c.name AS category_name, c.slug AS category_slug,
        (SELECT image_data_url FROM product_images WHERE product_id = p.id ORDER BY sort_order ASC, id ASC LIMIT 1) AS image
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.published_at DESC NULLS LAST, p.created_at DESC
    `, params);
    res.render('products', { title: 'Products', products: products.rows, categories: await loadCategories(), search, category });
  } catch (error) {
    next(error);
  }
});

app.get('/products/:slug', async (req, res, next) => {
  try {
    const product = await productWithImages(req.params.slug, true);
    if (!product) return res.status(404).render('404', { title: 'Product not found' });
    await pool.query('UPDATE products SET views = views + 1 WHERE id = $1', [product.id]);
    res.render('product-detail', { title: product.title, product });
  } catch (error) {
    next(error);
  }
});

app.post('/products/:id/inquiry', async (req, res, next) => {
  try {
    const product = await productWithImages(Number(req.params.id), true);
    if (!product) return res.status(404).render('404', { title: 'Product not found' });
    const name = safeTrim(req.body.name);
    const email = safeTrim(req.body.email).toLowerCase();
    const message = safeTrim(req.body.message);
    if (!name || !email || !message) {
      req.flash('error', 'Please fill in name, email, and message.');
      return res.redirect(`/products/${product.slug}#inquiry`);
    }
    await pool.query('INSERT INTO inquiries (product_id, name, email, message) VALUES ($1, $2, $3, $4)', [product.id, name, email, message]);
    req.flash('success', 'Inquiry submitted. The seller/admin can review it in the dashboard.');
    res.redirect(`/products/${product.slug}#inquiry`);
  } catch (error) {
    next(error);
  }
});

app.get('/register', (req, res) => res.render('auth-register', { title: 'Create account' }));

app.post('/register', async (req, res, next) => {
  try {
    const name = safeTrim(req.body.name);
    const email = safeTrim(req.body.email).toLowerCase();
    const password = String(req.body.password || '');
    if (!name || !email || password.length < 8) {
      req.flash('error', 'Please enter your name, email, and a password with at least 8 characters.');
      return res.redirect('/register');
    }
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rowCount) {
      req.flash('error', 'This email is already registered.');
      return res.redirect('/login');
    }
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, status, created_at',
      [name, email, hash, 'user']
    );
    req.session.user = result.rows[0];
    req.flash('success', 'Account created. You can now publish your product.');
    res.redirect('/dashboard');
  } catch (error) {
    next(error);
  }
});

app.get('/login', (req, res) => res.render('auth-login', { title: 'Log in' }));

app.post('/login', async (req, res, next) => {
  try {
    const email = safeTrim(req.body.email).toLowerCase();
    const password = String(req.body.password || '');
    const result = await pool.query('SELECT * FROM users WHERE email = $1 LIMIT 1', [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      req.flash('error', 'Invalid email or password.');
      return res.redirect('/login');
    }
    if (user.status === 'disabled') {
      req.flash('error', 'This account is disabled.');
      return res.redirect('/login');
    }
    req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status, created_at: user.created_at };
    req.flash('success', 'Welcome back.');
    res.redirect(user.role === 'admin' ? '/admin' : '/dashboard');
  } catch (error) {
    next(error);
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.get('/dashboard', requireAuth, async (req, res, next) => {
  try {
    const products = await pool.query(`
      SELECT p.*, c.name AS category_name,
        (SELECT image_data_url FROM product_images WHERE product_id = p.id ORDER BY sort_order ASC, id ASC LIMIT 1) AS image
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.user_id = $1
      ORDER BY p.created_at DESC
    `, [req.session.user.id]);
    res.render('dashboard', { title: 'My Products', products: products.rows });
  } catch (error) {
    next(error);
  }
});

app.get('/dashboard/products/new', requireAuth, async (req, res, next) => {
  try {
    res.render('product-form', { title: 'Publish Product', product: {}, categories: await loadCategories(), action: '/dashboard/products/new', mode: 'create' });
  } catch (error) {
    next(error);
  }
});

app.post('/dashboard/products/new', requireAuth, upload.array('images', 5), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const body = req.body;
    const title = safeTrim(body.title);
    const description = safeTrim(body.description);
    if (!title || !description) {
      req.flash('error', 'Product title and description are required.');
      return res.redirect('/dashboard/products/new');
    }
    const slug = await uniqueProductSlug(title);
    await client.query('BEGIN');
    const result = await client.query(`
      INSERT INTO products (user_id, category_id, title, slug, summary, description, price, currency, location, company, contact_email, whatsapp, website, status)
      VALUES ($1, NULLIF($2, '')::INTEGER, $3, $4, $5, $6, NULLIF($7, '')::NUMERIC, $8, $9, $10, $11, $12, $13, 'pending')
      RETURNING id
    `, [
      req.session.user.id,
      safeTrim(body.category_id),
      title,
      slug,
      safeTrim(body.summary),
      description,
      safeTrim(body.price),
      safeTrim(body.currency) || 'USD',
      safeTrim(body.location),
      safeTrim(body.company),
      safeTrim(body.contact_email),
      safeTrim(body.whatsapp),
      safeTrim(body.website),
    ]);
    const productId = result.rows[0].id;
    const files = req.files || [];
    for (let i = 0; i < files.length; i++) {
      await client.query('INSERT INTO product_images (product_id, image_data_url, alt_text, sort_order) VALUES ($1, $2, $3, $4)', [productId, imageToDataUrl(files[i]), title, i]);
    }
    await client.query('COMMIT');
    req.flash('success', 'Product submitted. Admin will review it before publishing.');
    res.redirect('/dashboard');
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

app.get('/dashboard/products/:id/edit', requireAuth, async (req, res, next) => {
  try {
    const product = await productWithImages(Number(req.params.id), false);
    if (!product || product.user_id !== req.session.user.id) {
      req.flash('error', 'Product not found.');
      return res.redirect('/dashboard');
    }
    res.render('product-form', { title: 'Edit Product', product, categories: await loadCategories(), action: `/dashboard/products/${product.id}/edit`, mode: 'edit' });
  } catch (error) {
    next(error);
  }
});

app.post('/dashboard/products/:id/edit', requireAuth, upload.array('images', 5), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const product = await productWithImages(Number(req.params.id), false);
    if (!product || product.user_id !== req.session.user.id) {
      req.flash('error', 'Product not found.');
      return res.redirect('/dashboard');
    }
    const body = req.body;
    const title = safeTrim(body.title);
    const description = safeTrim(body.description);
    if (!title || !description) {
      req.flash('error', 'Product title and description are required.');
      return res.redirect(`/dashboard/products/${product.id}/edit`);
    }
    const slug = await uniqueProductSlug(title, product.id);
    await client.query('BEGIN');
    await client.query(`
      UPDATE products SET
        category_id = NULLIF($1, '')::INTEGER,
        title = $2,
        slug = $3,
        summary = $4,
        description = $5,
        price = NULLIF($6, '')::NUMERIC,
        currency = $7,
        location = $8,
        company = $9,
        contact_email = $10,
        whatsapp = $11,
        website = $12,
        status = CASE WHEN status = 'approved' THEN 'pending' ELSE status END,
        rejection_reason = NULL,
        updated_at = NOW()
      WHERE id = $13 AND user_id = $14
    `, [
      safeTrim(body.category_id),
      title,
      slug,
      safeTrim(body.summary),
      description,
      safeTrim(body.price),
      safeTrim(body.currency) || 'USD',
      safeTrim(body.location),
      safeTrim(body.company),
      safeTrim(body.contact_email),
      safeTrim(body.whatsapp),
      safeTrim(body.website),
      product.id,
      req.session.user.id,
    ]);
    const files = req.files || [];
    if (files.length) {
      await client.query('DELETE FROM product_images WHERE product_id = $1', [product.id]);
      for (let i = 0; i < files.length; i++) {
        await client.query('INSERT INTO product_images (product_id, image_data_url, alt_text, sort_order) VALUES ($1, $2, $3, $4)', [product.id, imageToDataUrl(files[i]), title, i]);
      }
    }
    await client.query('COMMIT');
    req.flash('success', 'Product updated. If it was already approved, it is now pending review again.');
    res.redirect('/dashboard');
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

app.post('/dashboard/products/:id/archive', requireAuth, async (req, res, next) => {
  try {
    await pool.query('UPDATE products SET status = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3', ['archived', req.params.id, req.session.user.id]);
    req.flash('success', 'Product archived.');
    res.redirect('/dashboard');
  } catch (error) {
    next(error);
  }
});

app.get('/admin', requireAdmin, async (req, res, next) => {
  try {
    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM products WHERE status = 'pending') AS pending,
        (SELECT COUNT(*) FROM products WHERE status = 'approved') AS approved,
        (SELECT COUNT(*) FROM inquiries) AS inquiries
    `);
    const recentProducts = await pool.query(`
      SELECT p.*, c.name AS category_name, u.name AS seller_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      JOIN users u ON u.id = p.user_id
      ORDER BY p.created_at DESC
      LIMIT 8
    `);
    res.render('admin-index', { title: 'Admin Dashboard', stats: stats.rows[0], recentProducts: recentProducts.rows });
  } catch (error) {
    next(error);
  }
});

app.get('/admin/products', requireAdmin, async (req, res, next) => {
  try {
    const status = safeTrim(req.query.status);
    const params = [];
    let filter = '';
    if (['pending', 'approved', 'rejected', 'archived'].includes(status)) {
      params.push(status);
      filter = 'WHERE p.status = $1';
    }
    const products = await pool.query(`
      SELECT p.*, c.name AS category_name, u.name AS seller_name, u.email AS seller_email,
        (SELECT image_data_url FROM product_images WHERE product_id = p.id ORDER BY sort_order ASC, id ASC LIMIT 1) AS image
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      JOIN users u ON u.id = p.user_id
      ${filter}
      ORDER BY p.created_at DESC
    `, params);
    res.render('admin-products', { title: 'Manage Products', products: products.rows, status });
  } catch (error) {
    next(error);
  }
});

app.get('/admin/products/:id', requireAdmin, async (req, res, next) => {
  try {
    const product = await productWithImages(Number(req.params.id), false);
    if (!product) return res.status(404).render('404', { title: 'Product not found' });
    res.render('admin-product-detail', { title: product.title, product });
  } catch (error) {
    next(error);
  }
});

app.post('/admin/products/:id/approve', requireAdmin, async (req, res, next) => {
  try {
    await pool.query("UPDATE products SET status = 'approved', rejection_reason = NULL, published_at = COALESCE(published_at, NOW()), updated_at = NOW() WHERE id = $1", [req.params.id]);
    await logAdmin(req.session.user.id, 'approve_product', 'product', Number(req.params.id));
    req.flash('success', 'Product approved.');
    res.redirect('/admin/products');
  } catch (error) {
    next(error);
  }
});

app.post('/admin/products/:id/reject', requireAdmin, async (req, res, next) => {
  try {
    const reason = safeTrim(req.body.reason) || 'Rejected by admin.';
    await pool.query("UPDATE products SET status = 'rejected', rejection_reason = $2, updated_at = NOW() WHERE id = $1", [req.params.id, reason]);
    await logAdmin(req.session.user.id, 'reject_product', 'product', Number(req.params.id), { reason });
    req.flash('success', 'Product rejected.');
    res.redirect('/admin/products');
  } catch (error) {
    next(error);
  }
});

app.post('/admin/products/:id/archive', requireAdmin, async (req, res, next) => {
  try {
    await pool.query("UPDATE products SET status = 'archived', updated_at = NOW() WHERE id = $1", [req.params.id]);
    await logAdmin(req.session.user.id, 'archive_product', 'product', Number(req.params.id));
    req.flash('success', 'Product archived.');
    res.redirect('/admin/products');
  } catch (error) {
    next(error);
  }
});

app.post('/admin/products/:id/delete', requireAdmin, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    await logAdmin(req.session.user.id, 'delete_product', 'product', Number(req.params.id));
    req.flash('success', 'Product deleted.');
    res.redirect('/admin/products');
  } catch (error) {
    next(error);
  }
});

app.get('/admin/users', requireAdmin, async (req, res, next) => {
  try {
    const users = await pool.query(`
      SELECT u.*,
        (SELECT COUNT(*) FROM products p WHERE p.user_id = u.id) AS product_count
      FROM users u
      ORDER BY u.created_at DESC
    `);
    res.render('admin-users', { title: 'Manage Users', users: users.rows });
  } catch (error) {
    next(error);
  }
});

app.post('/admin/users/:id/role', requireAdmin, async (req, res, next) => {
  try {
    const role = req.body.role === 'admin' ? 'admin' : 'user';
    await pool.query('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2', [role, req.params.id]);
    await logAdmin(req.session.user.id, 'change_user_role', 'user', Number(req.params.id), { role });
    req.flash('success', 'User role updated.');
    res.redirect('/admin/users');
  } catch (error) {
    next(error);
  }
});

app.post('/admin/users/:id/status', requireAdmin, async (req, res, next) => {
  try {
    const status = req.body.status === 'disabled' ? 'disabled' : 'active';
    if (Number(req.params.id) === Number(req.session.user.id) && status === 'disabled') {
      req.flash('error', 'You cannot disable your own admin account.');
      return res.redirect('/admin/users');
    }
    await pool.query('UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2', [status, req.params.id]);
    await logAdmin(req.session.user.id, 'change_user_status', 'user', Number(req.params.id), { status });
    req.flash('success', 'User status updated.');
    res.redirect('/admin/users');
  } catch (error) {
    next(error);
  }
});

app.get('/admin/categories', requireAdmin, async (req, res, next) => {
  try {
    const categories = await pool.query(`
      SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count
      FROM categories c
      ORDER BY c.name ASC
    `);
    res.render('admin-categories', { title: 'Manage Categories', categories: categories.rows });
  } catch (error) {
    next(error);
  }
});

app.post('/admin/categories', requireAdmin, async (req, res, next) => {
  try {
    const name = safeTrim(req.body.name);
    if (!name) {
      req.flash('error', 'Category name is required.');
      return res.redirect('/admin/categories');
    }
    await pool.query('INSERT INTO categories (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING', [name, makeSlug(name)]);
    await logAdmin(req.session.user.id, 'create_category', 'category', null, { name });
    req.flash('success', 'Category created.');
    res.redirect('/admin/categories');
  } catch (error) {
    next(error);
  }
});

app.post('/admin/categories/:id/delete', requireAdmin, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM categories WHERE id = $1', [req.params.id]);
    await logAdmin(req.session.user.id, 'delete_category', 'category', Number(req.params.id));
    req.flash('success', 'Category deleted. Products in this category were not deleted.');
    res.redirect('/admin/categories');
  } catch (error) {
    next(error);
  }
});

app.get('/admin/inquiries', requireAdmin, async (req, res, next) => {
  try {
    const inquiries = await pool.query(`
      SELECT i.*, p.title AS product_title, p.slug AS product_slug
      FROM inquiries i
      JOIN products p ON p.id = i.product_id
      ORDER BY i.created_at DESC
    `);
    res.render('admin-inquiries', { title: 'Inquiries', inquiries: inquiries.rows });
  } catch (error) {
    next(error);
  }
});

app.get('/admin/logs', requireAdmin, async (req, res, next) => {
  try {
    const logs = await pool.query(`
      SELECT l.*, u.name AS admin_name, u.email AS admin_email
      FROM admin_logs l
      LEFT JOIN users u ON u.id = l.admin_user_id
      ORDER BY l.created_at DESC
      LIMIT 100
    `);
    res.render('admin-logs', { title: 'Admin Logs', logs: logs.rows });
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => res.status(404).render('404', { title: 'Page not found' }));

app.use((error, req, res, next) => {
  console.error(error);
  const message = error.message && error.message.includes('File too large')
    ? 'Image file is too large. Max size is 2MB per image.'
    : 'Something went wrong. Please try again.';
  res.status(500).render('error', { title: 'Server error', message, detail: isProduction ? null : error.stack });
});

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`WallPrinter Products MVP running on port ${PORT}`));
  })
  .catch((error) => {
    console.error('Database initialization failed:', error);
    process.exit(1);
  });
