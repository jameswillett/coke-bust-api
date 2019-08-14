const express = require('express');
const { Pool } = require('pg');
const moment = require('moment-timezone');
const Promise = require('bluebird');
const bodyParser = require('body-parser');
const R = require('ramda');

const { get3BV, score } = require('./functions');

const app = express();

const connectionString = process.env.DATABASE_URL || 'postgresql://james:@localhost:5432/cokebust';
const pool = new Pool({ connectionString });

const scoresService = require('./scoresService')(pool);

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept'
  );
  next();
});

// app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json({limit: '50mb'}));

const query = async (sql, params) => {
  const { rows } = await pool.query(sql, params);
  return rows;
};

const queryOne = (sql, params) => query(sql, query).then(R.head);
const format = d => moment(d).format('YY MM DD HH SS');

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
  const date = all ? moment('1987-03-20') : moment()
  const minDate = date.format('YYYY-MM-DD')
  try {
    const { rows: shows } = await pool.query(`SELECT * FROM SHOWS WHERE date >= $1`, [minDate]);
    const mappedShows = shows.map(s => ({
      ...s,
      date: moment(s.date).format('YYYY-MM-DD'),
    }))
    return res.send(mappedShows);
  } catch (e) {
    return res.send(e);
  }
});

app.get('/news', async (req, res) => {
  try {
    const { rows: news } = await pool.query('SELECT * FROM NEWS ORDER BY date DESC');
    const mappedNews = news.map(e => ({
      ...e,
      date: moment(e.date).format('YYYY-MM-DD'),
    }));
    return res.json(mappedNews);
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

app.get('/minesweeper/top50', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, name, score, difficulty FROM scores
      WHERE is_complete
      ORDER BY score DESC
      LIMIT 50
      `);

    return res.send({ rows });
  } catch (e) {
    console.log(e);
    res.send(e);
  }
});

app.post('/minesweeper/newgame', async (req, res) => {
  const {
    minClicks,
    difficulty,
  } = req.body;

  try {
    const { rows: [r] } = await pool.query(`
      INSERT INTO scores (minclicks, difficulty)
      VALUES ($1, $2)
      RETURNING *
      `, [minClicks, difficulty]
    );

    return res.send(R.pick(['id'], r));
  } catch (e) {
    console.log(e);
    return res.send(e);
  }
});

app.post('/minesweeper/recordclick', async (req, res) => {
  const {
    id,
  } = req.body;

  try {
    const { rows: [r] } = await pool.query(`
      SELECT id, clicks FROM scores
      WHERE id = $1 AND NOT is_complete
    `, [id]);

    if (!r) {
      console.log('you cheatin');
      throw new Error('you cheatin');
    }

    await query(`
      UPDATE scores SET clicks = $1
      WHERE id = $2 AND NOT is_complete
    `, [r.clicks + 1, id]);

    return res.send('click recorded');
  } catch(e) {
    console.log(e);
    return res.send(e);
  }
});

app.post('/minesweeper/newscore', async (req, res) => {
  const {
    clicks, board, startedAt, endedAt, difficulty, id,
  } = req.body;
  const minClicks = get3BV(board);
  const time = moment(endedAt).diff(startedAt, 'seconds');
  try {
    const { rows: [c] } = await pool.query(`
      SELECT clicks, minclicks FROM scores WHERE id = $1 AND NOT is_complete
    `, [id]);

    const theScore = score(minClicks, c.clicks, time, difficulty);
    const { rows: [r] } = await pool.query(`
      UPDATE scores SET
      score = $2, time = $3, is_complete = true
      WHERE id = $1 and not is_complete
      RETURNING *;
    `, [id, theScore, time]);
    const n = await scoresService.getNeighbors(r.id);
    res.send({ id: r.id });
  } catch(e) {
    console.log(e);
    return res.send(e);
  }
});

app.get('/minesweeper/gameover/:id', async (req, res) => {
  const {
    id,
  } = req.params;

  try {
    await pool.query(`
      DELETE FROM scores WHERE id = $1 AND NOT is_complete AND name IS NOT NULL
    `, [id]);

    return res.send({});
  } catch (e) {
    console.log(e);
    res.send(e);
  }
});

app.post('/minesweeper/registername', async (req, res) => {
  const { name, id } = req.body;

  try {
    await pool.query(`
      UPDATE scores
      SET name = $1
      WHERE id = $2;
    `, [name, id]);

    return res.send({});
  } catch (e) {
    console.log(e);
    return res.send(e);
  }
});

const listener = app.listen(process.env.PORT || 4000, () => {
  console.log(`Your app is listening on port ${listener.address().port}`);
});
