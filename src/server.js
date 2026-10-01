require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');

if (!process.env.JWT_SECRET) { console.error('JWT_SECRET is missing. Copy .env.example to .env first.'); process.exit(1); }
const port = process.env.PORT || 5000;
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/zaiqa_db')
  .then(() => app.listen(port, () => console.log(`Zaiqa running on http://localhost:${port}`)))
  .catch((e) => { console.error('MongoDB connection failed:', e.message); process.exit(1); });
