const pool = require('../db');

async function rebuildStandings() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE standings');
    await client.query('INSERT INTO standings(team_id) SELECT id FROM teams');

    const { rows } = await client.query(`
      SELECT home_team_id h, away_team_id a, home_score hs, away_score as
      FROM matches WHERE status='finished'
    `);

    for (const r of rows) {
      const win = r.hs > r.as ? r.h : r.a;
      const lose = r.hs > r.as ? r.a : r.h;
      const wpf = Math.max(r.hs, r.as), wpa = Math.min(r.hs, r.as);
      const lpf = wpa, lpa = wpf;

      await client.query(`
        UPDATE standings SET games_played=games_played+1, wins=wins+1,
          points_for=points_for+$1, points_against=points_against+$2
        WHERE team_id=$3
      `, [wpf, wpa, win]);

      await client.query(`
        UPDATE standings SET games_played=games_played+1, losses=losses+1,
          points_for=points_for+$1, points_against=points_against+$2
        WHERE team_id=$3
      `, [lpf, lpa, lose]);
    }

    await client.query(`
      UPDATE standings
      SET win_pct = CASE WHEN games_played=0 THEN 0
                         ELSE ROUND(wins::numeric/games_played, 3) END
    `);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { rebuildStandings };
