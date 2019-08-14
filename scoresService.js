module.exports = (pool) => ({
  getNeighbors: async (id, diff) => {
    const hasDiff = !isNaN(+diff);
    const { rows: allData } = await pool.query(`
      SELECT * FROM scores
      WHERE is_complete
      ${hasDiff ? 'AND diff = $1' : ''}
      ORDER BY score DESC
    `, hasDiff ? [diff] : undefined);

    const index = allData.findIndex(r => r.id === id);

    if (index === -1) return [];

    let shiftMin = -3;
    let shiftMax = 3;

    if (index < 2) {
      shiftMin += (2 - index);
      shiftMax += (1 - index);
    } else if (index < allData.length - 3) {
      shiftMin -= (allData.length - 3) - index;
      shiftMax -= (allData.length - 2) - index;
    }

    const neighbors = allData.filter((_, i) => i >= (index + shiftMin) && i <= (index + shiftMax))
    return neighbors;
  },
});

