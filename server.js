const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const cookieSession = require('cookie-session');
const bcrypt = require('bcryptjs');
const pool = require('./src/db');
const { CHECKLIST_ITEMS, LAWFUL_BASES, SECTORS } = require('./src/checklist');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET) {
  console.error('SESSION_SECRET is required');
  process.exit(1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
if (isProd) app.set('trust proxy', 1);

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  cookieSession({
    name: 'ir.sid',
    keys: [SESSION_SECRET],
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 8 * 60 * 60 * 1000,
  })
);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

const text = (value, max = 500) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';
const bool = (value) => value === 'on' || value === 'true';
const emailOk = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const dateOk = (value) => {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const idFrom = (req) => {
  const id = Number.parseInt(req.params.id, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
};

function renderError(res, status, title, message) {
  return res.status(status).render('error', { title, message });
}

function activityFromBody(body) {
  const values = {
    data_subject_category: text(body.data_subject_category, 150),
    data_description: text(body.data_description, 1000),
    is_sensitive: bool(body.is_sensitive),
    purpose: text(body.purpose, 500),
    lawful_basis: text(body.lawful_basis, 30),
    recipients: text(body.recipients, 500),
    storage_location: text(body.storage_location, 300),
    cross_border: bool(body.cross_border),
    retention: text(body.retention, 300),
    security_measures: text(body.security_measures, 500),
  };

  const errors = {};
  if (!values.data_subject_category) errors.data_subject_category = 'Required';
  if (!values.data_description) errors.data_description = 'Required';
  if (!values.purpose) errors.purpose = 'Required';
  if (!LAWFUL_BASES.some((item) => item.value === values.lawful_basis)) {
    errors.lawful_basis = 'Choose a lawful basis';
  }
  if (!values.storage_location) errors.storage_location = 'Required';
  return { values, errors };
}

// --- Middleware -----------------------------------------------------------

app.use((req, res, next) => {
  res.locals.title = 'InspectorReady ZW';
  res.locals.user = null;
  res.locals.org = null;
  res.locals.isDemo = false;
  res.locals.flash = null;
  res.locals.csrfToken = '';
  res.locals.path = req.path;
  res.locals.SECTORS = SECTORS;
  res.locals.LAWFUL_BASES = LAWFUL_BASES;
  next();
});

app.use((req, res, next) => {
  if (!req.session.csrf) {
    req.session.csrf = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrf;
  next();
});

app.use((req, res, next) => {
  if (req.session && req.session.flash) {
    res.locals.flash = req.session.flash;
    delete req.session.flash;
  }
  next();
});

app.use(async (req, res, next) => {
  if (!req.session || !req.session.userId) return next();
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.full_name, u.role,
            o.id AS org_id, o.name, o.registered_name, o.reg_number, o.sector, o.contact_email
     FROM users u
     JOIN orgs o ON o.id = u.org_id
     WHERE u.id = $1`,
    [req.session.userId]
  );
  if (!rows[0]) {
    req.session = null;
    return next();
  }
  const row = rows[0];
  req.user = {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    role: row.role,
    org_id: row.org_id,
  };
  res.locals.user = req.user;
  res.locals.org = {
    id: row.org_id,
    name: row.name,
    registered_name: row.registered_name,
    reg_number: row.reg_number,
    sector: row.sector,
    contact_email: row.contact_email,
  };
  res.locals.isDemo = Boolean(req.session.isDemo);
  next();
});

function requireAuth(req, res, next) {
  if (!req.user) {
    req.session.flash = { type: 'error', message: 'Please log in first.' };
    return res.redirect('/login');
  }
  next();
}

function requireWrite(req, res, next) {
  if (req.session.isDemo) {
    req.session.flash = {
      type: 'error',
      message: 'The demo account is read-only. Create an account to make changes.',
    };
    return res.redirect('/dashboard');
  }
  next();
}

function csrfCheck(req, res, next) {
  const supplied = String(req.body._csrf || '');
  const expected = String((req.session && req.session.csrf) || '');
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return renderError(
      res,
      403,
      'Invalid request',
      'Your form session expired. Go back, reload the page and try again.'
    );
  }
  next();
}

const loginAttempts = new Map();
const LOGIN_WINDOW = 15 * 60 * 1000;
const LOGIN_MAX = 10;

function loginRateLimit(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  if (loginAttempts.size > 1000) {
    for (const [ip, entry] of loginAttempts) {
      if (entry.resetAt <= now) loginAttempts.delete(ip);
    }
  }

  const entry = loginAttempts.get(key);
  if (entry && entry.resetAt > now && entry.count >= LOGIN_MAX) {
    return res.status(429).render('login', {
      title: 'Log in',
      error: 'Too many attempts. Try again in 15 minutes.',
      email: '',
    });
  }
  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(key, { count: 0, resetAt: now + LOGIN_WINDOW });
  }
  req.rateKey = key;
  next();
}

// --- Public routes --------------------------------------------------------

app.get('/', (req, res) => {
  res.render('landing', { title: 'InspectorReady ZW' });
});

app.get('/signup', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('signup', { title: 'Create account', error: null, form: {} });
});

app.post('/signup', csrfCheck, async (req, res) => {
  if (req.user) return res.redirect('/dashboard');

  const form = {
    full_name: text(req.body.full_name, 100),
    email: text(req.body.email, 200).toLowerCase(),
    org_name: text(req.body.org_name, 150),
    registered_name: text(req.body.registered_name, 200),
    reg_number: text(req.body.reg_number, 100),
    sector: text(req.body.sector, 60),
    contact_email: text(req.body.contact_email, 200).toLowerCase(),
  };
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  let error = null;
  if (!form.full_name) error = 'Enter your full name.';
  else if (!emailOk(form.email)) error = 'Enter a valid email address.';
  else if (password.length < 8) error = 'Password must be at least 8 characters.';
  else if (password.length > 200) error = 'Password is too long.';
  else if (!form.org_name) error = 'Enter your organisation name.';
  else if (!SECTORS.includes(form.sector)) error = 'Choose your sector.';
  else if (!emailOk(form.contact_email)) error = 'Enter a valid organisation contact email.';

  if (error) {
    return res.status(400).render('signup', { title: 'Create account', error, form });
  }

  const hash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const org = await client.query(
      `INSERT INTO orgs (name, registered_name, reg_number, sector, contact_email)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [form.org_name, form.registered_name || null, form.reg_number || null, form.sector, form.contact_email]
    );
    const orgId = org.rows[0].id;
    const user = await client.query(
      `INSERT INTO users (org_id, email, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4, 'owner') RETURNING id`,
      [orgId, form.email, hash, form.full_name]
    );
    for (const item of CHECKLIST_ITEMS) {
      await client.query(
        `INSERT INTO compliance_items (org_id, code, title) VALUES ($1, $2, $3)`,
        [orgId, item.code, item.title]
      );
    }
    await client.query('COMMIT');

    req.session.userId = user.rows[0].id;
    req.session.isDemo = false;
    req.session.csrf = crypto.randomBytes(32).toString('hex');
    req.session.flash = {
      type: 'success',
      message: 'Account created. Add your first processing activity.',
    };
    res.redirect('/dashboard');
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(400).render('signup', {
        title: 'Create account',
        error: 'An account with that email already exists.',
        form,
      });
    }
    throw err;
  } finally {
    client.release();
  }
});

app.get('/login', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('login', { title: 'Log in', error: null, email: '' });
});

app.post('/login', loginRateLimit, csrfCheck, async (req, res) => {
  if (req.user) return res.redirect('/dashboard');

  const email = text(req.body.email, 200).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  const { rows } = await pool.query(
    `SELECT id, password_hash FROM users WHERE email = $1`,
    [email]
  );
  const user = rows[0];
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);

  if (!user || !ok) {
    const entry = loginAttempts.get(req.rateKey);
    if (entry) entry.count += 1;
    return res.status(401).render('login', {
      title: 'Log in',
      error: 'Email or password is incorrect.',
      email,
    });
  }

  loginAttempts.delete(req.rateKey);
  req.session.userId = user.id;
  req.session.isDemo = false;
  req.session.csrf = crypto.randomBytes(32).toString('hex');
  req.session.flash = { type: 'success', message: 'Welcome back.' };
  res.redirect('/dashboard');
});

app.get('/demo', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id FROM users WHERE email = $1`,
    ['demo@inspectorready.co.zw']
  );
  if (!rows[0]) {
    req.session.flash = { type: 'error', message: 'The demo account is not seeded.' };
    return res.redirect('/login');
  }
  req.session.userId = rows[0].id;
  req.session.isDemo = true;
  req.session.csrf = crypto.randomBytes(32).toString('hex');
  req.session.flash = {
    type: 'success',
    message: 'You are viewing the read-only demo. Create an account to make changes.',
  };
  res.redirect('/dashboard');
});

app.post('/logout', csrfCheck, (req, res) => {
  req.session = null;
  res.redirect('/');
});

// --- Dashboard ------------------------------------------------------------

app.get('/dashboard', requireAuth, async (req, res) => {
  const orgId = req.user.org_id;
  const [items, stats, activities] = await Promise.all([
    pool.query(
      `SELECT code, title, status, evidence_note,
              to_char(evidence_date, 'YYYY-MM-DD') AS evidence_date
       FROM compliance_items WHERE org_id = $1 ORDER BY id`,
      [orgId]
    ),
    pool.query(
      `SELECT count(*) FILTER (WHERE status = 'done')::int AS done,
              count(*)::int AS total,
              coalesce(round(100.0 * count(*) FILTER (WHERE status = 'done')
                / nullif(count(*), 0)), 0)::int AS score
       FROM compliance_items WHERE org_id = $1`,
      [orgId]
    ),
    pool.query(
      `SELECT id, data_subject_category, purpose, storage_location, cross_border, is_sensitive
       FROM processing_activities WHERE org_id = $1
       ORDER BY created_at DESC, id DESC LIMIT 5`,
      [orgId]
    ),
  ]);

  res.render('dashboard', {
    title: 'Dashboard',
    items: items.rows,
    stats: stats.rows[0],
    activities: activities.rows,
  });
});

app.post('/checklist/:code', requireAuth, requireWrite, csrfCheck, async (req, res) => {
  const code = req.params.code;
  if (!CHECKLIST_ITEMS.some((item) => item.code === code)) {
    return renderError(res, 404, 'Checklist item not found', 'That checklist item does not exist.');
  }

  const status = text(req.body.status, 20);
  const note = text(req.body.evidence_note, 500);
  const date = text(req.body.evidence_date, 10);

  if (!['missing', 'in_progress', 'done'].includes(status) || !dateOk(date)) {
    req.session.flash = { type: 'error', message: 'Choose a valid status and date.' };
    return res.redirect('/dashboard');
  }

  await pool.query(
    `UPDATE compliance_items
     SET status = $1, evidence_note = nullif($2, ''),
         evidence_date = nullif($3, '')::date, updated_at = now()
     WHERE org_id = $4 AND code = $5`,
    [status, note, date, req.user.org_id, code]
  );

  req.session.flash = { type: 'success', message: 'Checklist updated.' };
  res.redirect(`/dashboard#${encodeURIComponent(code)}`);
});

// --- Processing activities ------------------------------------------------

app.get('/activities', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, data_subject_category, purpose, storage_location, cross_border, is_sensitive
     FROM processing_activities WHERE org_id = $1
     ORDER BY created_at DESC, id DESC`,
    [req.user.org_id]
  );
  res.render('activities', { title: 'Processing activities', activities: rows });
});

app.get('/activities/new', requireAuth, requireWrite, (req, res) => {
  res.render('activity-form', {
    title: 'Add processing activity',
    activity: {},
    errors: {},
    isEdit: false,
    action: '/activities',
  });
});

app.post('/activities', requireAuth, requireWrite, csrfCheck, async (req, res) => {
  const { values, errors } = activityFromBody(req.body);
  if (Object.keys(errors).length) {
    return res.status(400).render('activity-form', {
      title: 'Add processing activity',
      activity: values,
      errors,
      isEdit: false,
      action: '/activities',
    });
  }

  await pool.query(
    `INSERT INTO processing_activities
       (org_id, data_subject_category, data_description, is_sensitive, purpose,
        lawful_basis, recipients, storage_location, cross_border, retention, security_measures)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      req.user.org_id,
      values.data_subject_category,
      values.data_description,
      values.is_sensitive,
      values.purpose,
      values.lawful_basis,
      values.recipients || null,
      values.storage_location,
      values.cross_border,
      values.retention || null,
      values.security_measures || null,
    ]
  );

  req.session.flash = { type: 'success', message: 'Processing activity added.' };
  res.redirect('/activities');
});

app.get('/activities/:id/edit', requireAuth, requireWrite, async (req, res) => {
  const id = idFrom(req);
  if (!id) return renderError(res, 404, 'Activity not found', 'That processing activity does not exist.');

  const { rows } = await pool.query(
    `SELECT id, data_subject_category, data_description, is_sensitive, purpose,
            lawful_basis, recipients, storage_location, cross_border, retention, security_measures
     FROM processing_activities WHERE id = $1 AND org_id = $2`,
    [id, req.user.org_id]
  );
  if (!rows[0]) {
    return renderError(res, 404, 'Activity not found', 'That processing activity does not exist.');
  }

  res.render('activity-form', {
    title: 'Edit processing activity',
    activity: rows[0],
    errors: {},
    isEdit: true,
    action: `/activities/${rows[0].id}`,
  });
});

app.post('/activities/:id', requireAuth, requireWrite, csrfCheck, async (req, res) => {
  const id = idFrom(req);
  if (!id) return renderError(res, 404, 'Activity not found', 'That processing activity does not exist.');

  const { values, errors } = activityFromBody(req.body);
  if (Object.keys(errors).length) {
    return res.status(400).render('activity-form', {
      title: 'Edit processing activity',
      activity: values,
      errors,
      isEdit: true,
      action: `/activities/${id}`,
    });
  }

  const result = await pool.query(
    `UPDATE processing_activities
     SET data_subject_category = $1, data_description = $2, is_sensitive = $3,
         purpose = $4, lawful_basis = $5, recipients = $6, storage_location = $7,
         cross_border = $8, retention = $9, security_measures = $10, updated_at = now()
     WHERE id = $11 AND org_id = $12`,
    [
      values.data_subject_category,
      values.data_description,
      values.is_sensitive,
      values.purpose,
      values.lawful_basis,
      values.recipients || null,
      values.storage_location,
      values.cross_border,
      values.retention || null,
      values.security_measures || null,
      id,
      req.user.org_id,
    ]
  );

  if (!result.rowCount) {
    return renderError(res, 404, 'Activity not found', 'That processing activity does not exist.');
  }

  req.session.flash = { type: 'success', message: 'Processing activity updated.' };
  res.redirect('/activities');
});

app.post('/activities/:id/delete', requireAuth, requireWrite, csrfCheck, async (req, res) => {
  const id = idFrom(req);
  if (!id) return renderError(res, 404, 'Activity not found', 'That processing activity does not exist.');

  const result = await pool.query(
    `DELETE FROM processing_activities WHERE id = $1 AND org_id = $2`,
    [id, req.user.org_id]
  );

  if (!result.rowCount) {
    return renderError(res, 404, 'Activity not found', 'That processing activity does not exist.');
  }

  req.session.flash = { type: 'success', message: 'Processing activity deleted.' };
  res.redirect('/activities');
});

// --- Export ---------------------------------------------------------------

app.get('/export', requireAuth, async (req, res) => {
  const orgId = req.user.org_id;
  const [activities, items, stats] = await Promise.all([
    pool.query(
      `SELECT data_subject_category, data_description, is_sensitive, purpose, lawful_basis,
              recipients, storage_location, cross_border, retention, security_measures
       FROM processing_activities WHERE org_id = $1
       ORDER BY created_at ASC, id ASC`,
      [orgId]
    ),
    pool.query(
      `SELECT code, title, status, evidence_note,
              to_char(evidence_date, 'YYYY-MM-DD') AS evidence_date
       FROM compliance_items WHERE org_id = $1 ORDER BY id`,
      [orgId]
    ),
    pool.query(
      `SELECT count(*) FILTER (WHERE status = 'done')::int AS done,
              count(*)::int AS total,
              coalesce(round(100.0 * count(*) FILTER (WHERE status = 'done')
                / nullif(count(*), 0)), 0)::int AS score
       FROM compliance_items WHERE org_id = $1`,
      [orgId]
    ),
  ]);

  const generatedAt = new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Africa/Harare',
  }).format(new Date());

  res.render('export', {
    title: 'Export pack',
    activities: activities.rows,
    items: items.rows,
    stats: stats.rows[0],
    generatedAt,
  });
});

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

// --- Errors ---------------------------------------------------------------

app.use((req, res) => {
  renderError(res, 404, 'Page not found', 'That page does not exist.');
});

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  renderError(
    res,
    500,
    'Something went wrong',
    'Please try again. If it keeps happening, contact the administrator.'
  );
});

app.listen(PORT, () => {
  console.log(`InspectorReady ZW listening on port ${PORT}`);
});
