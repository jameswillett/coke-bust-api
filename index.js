const express = require('express');
const { Pool } = require('pg');
const format = require('date-fns/format');
const Promise = require('bluebird');

const app = express();

const connectionString = process.env.DATABASE_URL || 'postgresql://james:@localhost:5432/cokebust';
const pool = new Pool({ connectionString });

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept'
  );
  next();
});

app.get('/', async (req, res) => {
  const queries = [
    pool.query('SELECT * FROM SHOWS'),
    pool.query('SELECT * FROM NEWS'),
    pool.query('SELECT * FROM RELEASES')
  ]
  try {
    const [ shows, news, releases ] = await Promise.map(queries, ({ rows }) => rows);
    return res.json({ shows, news, releases });
  } catch (e) {
    return res.send(e);
  }
});

app.get('/shows/:all?', async (req, res) => {
  const { all } = req.params;
  const today = format(!all ? new Date() : new Date('1987-03-20'), 'YYYY-MM-DD')
  try {
    const { rows: shows } = await pool.query(`SELECT * FROM SHOWS WHERE date >= $1`, [today]);
    return res.send(shows);
  } catch (e) {
    return res.send(e);
  }
});

app.get('/news', async (req, res) => {
  try {
    const { rows: news } = await pool.query('SELECT * FROM NEWS');
    return res.json(news);
  } catch (e) {
    return res.send(e);
  }
});

app.get('/releases', async (req, res) => {
  try {
    const { rows: releases } = await pool.query('SELECT id, name, year, imgsrc, meta FROM RELEASES ORDER BY year DESC');
    return res.json(releases);
  } catch (e) {
    return res.send(e);
  }
});

app.get('/releases/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows: [ release ] } = await pool.query('SELECT * FROM RELEASES WHERE id=$1', [id]);
    return res.json(release);
  } catch (e) {
    return res.send(e);
  }
});

const listener = app.listen(process.env.PORT || 4000, () => {
  console.log(`Your app is listening on port ${listener.address().port}`);
});
