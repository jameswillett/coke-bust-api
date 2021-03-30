const express = require('express');
const { Pool } = require('pg');
const moment = require('moment-timezone');
const Promise = require('bluebird');
const bodyParser = require('body-parser');
const R = require('ramda');

const dejarble = require('./dejarbler')(process.env.JARBLE_CODE);
const { get3BV, score } = require('./functions');

const app = express();

const connectionString = process.env.DATABASE_URL || 'postgresql://james:@localhost:5432/cokebust';
const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

const scoresService = require('./scoresService')(pool);
const newKey = () => Number(String(Math.random()).substring(2)).toString(36);

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept'
  );
  next();
});

const makeGillissLifeHarder = (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    if (
      /minesweepie\.herokuapp\.com$/.test(req.headers.origin) ||
      /jameswillett\.github\.io/.test(req.headers.origin)
    ) {
      return next()
    } else {
      return res.status(500).send({ error: 'u a punk' })
    }
  }
  return next();
}

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
    pool.query(`SELECT * FROM SHOWS`),
    pool.query(`SELECT * FROM NEWS`),
    pool.query(`SELECT * FROM RELEASES`)
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
    const { rows: news } = await pool.query(`SELECT * FROM NEWS ORDER BY date DESC`);
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
    const { rows: releases } = await pool.query(`SELECT id, name, year, imgsrc, meta FROM RELEASES ORDER BY year DESC`);
    return res.json(releases);
  } catch (e) {
    return res.send(e);
  }
});

app.get('/releases/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows: [ release ] } = await pool.query(`SELECT * FROM RELEASES WHERE id=$1`, [id]);
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
      AND name IS NOT NULL
      ORDER BY score DESC
      LIMIT 50
      `);

    return res.send({ rows });
  } catch (e) {
    console.log(e);
    res.status(500);
    return res.send(e);
  }
});

app.post('/minesweeper/newgame', makeGillissLifeHarder, async (req, res) => {
  const {
    minClicks,
    difficulty,
  } = req.body;

  try {
    const { rows: [r] } = await pool.query(`
      INSERT INTO scores (minclicks, difficulty, lastkey)
      VALUES ($1, $2, $3)
      RETURNING *
      `, [minClicks, difficulty, newKey()]
    );

    return res.send(R.pick(['id', 'lastkey'], r));
  } catch (e) {
    console.log(e);
    res.status(500);
    return res.send(e);
  }
});

app.post('/minesweeper/recordclick', makeGillissLifeHarder, async (req, res) => {
  const {
    id,
    key,
  } = req.body;

  try {
    const { rows: [r] } = await pool.query(`
      SELECT id, clicks, lastkey FROM scores
      WHERE id = $1 AND NOT is_complete
    `, [id]);

    if (!r) {
      console.log('you cheatin');
      throw new Error('you cheatin');
    }

    const [newRow] = await query(`
      UPDATE scores SET clicks = $1, lastkey = $3
      WHERE id = $2 AND NOT is_complete
      RETURNING *
    `, [r.clicks + 1, id, newKey()]);

    return res.send(newRow);
  } catch(e) {
    console.log(e);
    res.status(500);
    return res.send(e);
  }
});

app.post('/minesweeper/newscore', makeGillissLifeHarder, async (req, res) => {
  const {
    clicks, board, startedAt, endedAt, difficulty, id, key,
  } = req.body;
  try {
    const { rows: [c] } = await pool.query(`
      SELECT clicks, minclicks, lastkey FROM scores WHERE id = $1 AND NOT is_complete
    `, [id]);

    const minClicks = get3BV(board);
    const time = moment(endedAt).diff(startedAt, 'seconds');

    const theScore = score(minClicks, Math.max(c.clicks, clicks), time, difficulty);

    if (dejarble(key) !== c.lastkey) {
      console.log('jarbler mismatch: ', dejarble(key), c.lastkey, `${id} would have a score of ${theScore}`);
      throw new Error(`youre a dang cheater or james fucked something up.`);
    }

    if (board.filter(r => Array.isArray(r)).length !== board.length) {
      console.log('board mismatch', `${id} would have a score of ${theScore}`);
      throw new Error(`you cheatin.`);
    }

    const { rows: [r] } = await pool.query(`
      UPDATE scores SET
      score = $2, time = $3, is_complete = true
      WHERE id = $1 and not is_complete
      RETURNING *;
    `, [id, theScore, time]);
    res.send({ id: r.id });
  } catch(e) {
    console.log(e);
    res.status(500);
    return res.send(e);
  }
});

app.get('/minesweeper/gameover/:id', makeGillissLifeHarder, async (req, res) => {
  const {
    id,
  } = req.params;

  try {
    await pool.query(`
      DELETE FROM scores WHERE id = $1 AND NOT is_complete AND name IS NULL
    `, [id]);

    return res.send({});
  } catch (e) {
    console.log(e);
    res.status(500);
    return res.send(e);
  }
});

app.post('/minesweeper/registername', makeGillissLifeHarder, async (req, res) => {
  const { name, id } = req.body;

  try {
    await pool.query(`
      UPDATE scores
      SET name = $1
      WHERE id = $2
    `, [String(name).substr(0, 30), id]);

    return res.send({});
  } catch (e) {
    console.log(e);
    res.status(500);
    return res.send(e);
  }
});

const listener = app.listen(process.env.PORT || 4000, () => {
  console.log(`Your app is listening on port ${listener.address().port}`);
});
