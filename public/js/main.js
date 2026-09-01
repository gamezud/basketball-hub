// Public/js/main.js
(async function () {
  const fx = await (await fetch('/api/matches')).json();
  document.getElementById('fixtures').innerHTML =
    '<h2>Fixtures</h2>' +
    fx.map(m =>
      `<div>${new Date(m.tipoff_at).toLocaleString()} — ${m.home_name} vs ${m.away_name} @ ${m.venue} [${m.status}]</div>`
    ).join('');

  const st = await (await fetch('/api/standings')).json();
  document.getElementById('standings').innerHTML =
    '<h2>Standings</h2><ol>' +
    st.map(s => `<li>${s.name} — W:${s.wins} L:${s.losses} Pct:${s.win_pct}</li>`).join('') +
    '</ol>';
})();
