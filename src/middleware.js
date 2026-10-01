const jwt = require('jsonwebtoken');

class ApiError extends Error {
  constructor(status, message, errors = []) { super(message); this.status = status; this.errors = errors; }
}
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const ok = (res, data, message = 'Success', status = 200, extra = {}) =>
  res.status(status).json({ success: true, message, data, ...extra });
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const authenticate = wrap(async (req, res, next) => {
  const { User } = require('./models');
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) throw new ApiError(401, 'Authentication required');
  let p;
  try { p = jwt.verify(h.slice(7), process.env.JWT_SECRET); }
  catch (e) { throw new ApiError(401, e.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token'); }
  const u = await User.findById(p.id);
  if (!u) throw new ApiError(401, 'User no longer exists');
  if (u.isBlocked) throw new ApiError(403, 'Your account is blocked');
  if (u.passwordChangedAt && p.iat < Math.floor(u.passwordChangedAt.getTime() / 1000))
    throw new ApiError(401, 'Session expired, please log in again');
  req.user = u;
  next();
});

const authorize = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : next(new ApiError(403, 'You do not have permission for this action'));

const validate = (schema, src = 'body') => (req, res, next) => {
  const { value, error } = schema.validate(req[src], { abortEarly: false, stripUnknown: true });
  if (error) return next(new ApiError(422, 'Validation failed', error.details.map((d) => ({ field: d.path.join('.'), message: d.message.replace(/"/g, '') }))));
  req[src] = value;
  next();
};

const clean = (o) => {
  if (o && typeof o === 'object') for (const k of Object.keys(o)) {
    if (k.startsWith('$') || k.includes('.')) delete o[k]; else clean(o[k]);
  }
};
const sanitize = (req, res, next) => { clean(req.body); clean(req.query); next(); };

async function paginate(Model, filter, req, { sort = '-createdAt', populate } = {}) {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
  let q = Model.find(filter).sort(sort).skip((page - 1) * limit).limit(limit);
  if (populate) q = q.populate(populate);
  const [items, total] = await Promise.all([q, Model.countDocuments(filter)]);
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

const notFound = (req, res, next) => next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
const errorHandler = (err, req, res, next) => { // eslint-disable-line
  let { status = 500, message, errors = [] } = err;
  if (err.code === 11000) { status = 409; message = 'Duplicate value: ' + Object.keys(err.keyValue || {}).join(', '); }
  else if (err.name === 'CastError') { status = 400; message = `Invalid ${err.path}`; }
  else if (err.name === 'ValidationError') { status = 422; errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message })); message = 'Validation failed'; }
  else if (err.type === 'entity.parse.failed') { status = 400; message = 'Malformed JSON body'; }
  if (status === 500) { console.error(err); message = 'Internal server error'; }
  res.status(status).json({ success: false, message, errors });
};

module.exports = { ApiError, wrap, ok, esc, authenticate, authorize, validate, sanitize, paginate, notFound, errorHandler };
