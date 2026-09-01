// app.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// middlewares ก่อน
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// static
app.use(express.static(path.join(__dirname, 'public')));

// routers
const matchesRouter   = require('./routes/matches');
const standingsRouter = require('./routes/standings');
app.use('/api/matches',   matchesRouter);
app.use('/api/standings', standingsRouter);

app.use('/api/auth',    require('./routes/auth'));
app.use('/api/teams',   require('./routes/teams'));
app.use('/api',         require('./routes/events')); // /events, /seats, /orders

// pages
app.get('/',        (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/matches', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'matches.html')));

// error handler
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Basketball Hub API on :' + port));
