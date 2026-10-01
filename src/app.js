require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const routes = require('./routes');
const { sanitize, notFound, errorHandler } = require('./middleware');

const app = express();
app.use(helmet({
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'", "'unsafe-inline'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:', 'https:'], connectSrc: ["'self'"],
  } },
}));
app.use(cors({ origin: process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',') : true }));
app.use(express.json({ limit: '100kb' }));
app.use(sanitize);
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));
const dist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(dist));
app.use('/api', routes);
app.use('/api', notFound);
app.get('*', (req, res, next) => (fs.existsSync(path.join(dist, 'index.html')) ? res.sendFile(path.join(dist, 'index.html')) : next())); // React router fallback
app.use(errorHandler);
module.exports = app;
