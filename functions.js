const R = require('ramda');

const getNeighbors = (x, y, b, includeDiag = true) => [
  b[y - 1] && includeDiag && b[y - 1][x - 1],
  b[y] && b[y][x - 1],
  b[y + 1] && includeDiag && b[y + 1][x - 1],
  b[y - 1] && b[y - 1][x],
  b[y + 1] && b[y + 1][x],
  b[y - 1] && includeDiag && b[y - 1][x + 1],
  b[y] && b[y][x + 1],
  b[y + 1] && includeDiag && b[y + 1][x + 1],
].filter(x => x);

const propagate = (cell, board, acc) => {
  if (!cell.isMine && cell.count === 0 && !cell.flagged && !cell.dunno) {
    const freshNeighbors = getNeighbors(cell.x, cell.y, board, true)
      .filter(n => !acc || !acc[n.y] || !acc[n.y].includes(n.x))

    const emptyNeighbors = freshNeighbors.filter(n => n.count === 0);

    if (freshNeighbors.length === 0) return [];

    const newAcc = freshNeighbors.reduce((a, c) => {
      if (!a[c.y]) {
        a[c.y] = [c.x];
      } else {
        a[c.y].push(c.x);
      }
      return a;
    }, acc || []);

    return R.flatten(freshNeighbors.concat(emptyNeighbors.map(n => propagate(n, board, newAcc))));
  }
  return [];
};

const propagateMap = R.reduce((a, c) => ({...a, [c.y]: { ...a[c.y], [c.x]: true }}), {});

const get3BV = (board) => {
  const edges = R.flatten(board).filter(c => !c.isMine && !c.count).reduce((a, c) => {
    if (a.board[c.y][c.x].marked) return a;
    const p = propagateMap(propagate({ ...c, marked: true }, board));

    const newBoard = a.board.map((row, y) => row.map((cell, x) => {
      if (p && p[y] && p[y][x]) return { ...cell, marked: true };
      return cell;
    }));

    return { board: newBoard , chunks: a.chunks + 1 };
  }, { board, chunks: 0 })

  const bits = edges.board.filter(c => !c.marked && !c.isMine).length;

  return edges.chunks + bits;
};

const score = (minClicks, clicks, time, difficulty) => Math.floor((
  ((minClicks ** 3) * ((difficulty ** 3) + 1)) /
  ((clicks * 3 || 1) * (time * 2 || 1))
) * 10000);

module.exports = {
  get3BV,
  score,
};
