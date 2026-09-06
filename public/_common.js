// ===== helpers ใช้ร่วมกันทุกหน้า =====
const token = localStorage.getItem("token") || "";

function me() {
  try {
    return token ? JSON.parse(atob(token.split(".")[1])) : null;
  } catch {
    return null;
  }
}

function authHeaders() {
  return token ? { Authorization: "Bearer " + token } : {};
}

function requireLogin() {
  if (!token) {
    alert("กรุณา Login ก่อน");
    location.href = "login.html";
  }
}

function isAdmin() {
  return (me()?.roles || []).includes("admin");
}

function navBar(active) {
  const t = localStorage.getItem("token");
  const loggedIn = !!t;
  const user = loggedIn ? me() : null;

  const links = [
    ['index.html', 'Home'],
    ['teams.html', 'Teams'],
    ['matches.html', 'Matches'],
    ['events.html', 'Events'],
    ['standings.html', 'Standings']
  ];
  if (loggedIn) links.push(['ticket.html', 'My Tickets']);

  const navLinks = links.map(([href, label]) => {
    const cls = active === label.toLowerCase() ? ' class="active"' : '';
    return `<a href="${href}"${cls}>${label}</a>`;
  }).join('');

  const userInfo = loggedIn
    ? `${user.sub} (${(user.roles || []).join('|') || 'user'})`
    : 'guest';

  const authControl = loggedIn
    ? '<button id="logoutBtn" class="btn-secondary">Logout</button>'
    : '<a href="login.html" class="btn btn-secondary">Login</a>';

  return `
    <nav class="navbar">
      <span class="brand">Basketball Hub</span>
      ${navLinks}
      <span class="spacer"></span>
      <span id="who" class="pill">${userInfo}</span>
      ${authControl}
    </nav>
  `;
}


function bindLogout() {
  const b = document.getElementById("logoutBtn");
  if (b)
    b.onclick = () => {
      localStorage.removeItem("token");
      location.reload();
    };
}

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      errMsg = data.error || data.message || errMsg;
    } catch {
      try {
        errMsg = (await res.text()) || errMsg;
      } catch {}
    }
    const err = new Error(errMsg);
    err.status = res.status;
    throw err;
  }
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function gateGuestsOrRenderMsg() {
  if (!me()) {
    // ซ่อนทุกอย่างยกเว้น nav
    [...document.body.children].forEach((el) => {
      if (el.id !== "nav") el.style.display = "none";
    });
    // ข้อความเตือน
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div class="guest-message">ต้องเข้าสู่ระบบก่อนเพื่อดูข้อมูล</div>'
    );
    return true; // บอกว่าเป็น guest
  }
  return false; // ล็อกอินอยู่ ดำเนินต่อได้
}
