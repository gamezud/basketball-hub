// Public/js/login.js
document.getElementById('f').onsubmit = async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target));
  const r = await fetch('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const d = await r.json();
  if (d.token) {
    localStorage.setItem('token', d.token);
    alert('Logged in');
    location.href = 'index.html';
  } else alert(d.error || 'Login failed');
};
