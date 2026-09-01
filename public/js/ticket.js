// Public/js/ticket.js
const token = localStorage.getItem('token') || '';

document.getElementById('load').onclick = loadSeats;

async function loadSeats() {
  const id = document.getElementById('eventId').value;
  const seats = await (await fetch(`/api/events/${id}/seats`)).json();
  const div = document.getElementById('seats');
  div.innerHTML = seats.map(s =>
    `<button data-id="${s.id}" ${s.status !== 'available' ? 'disabled' : ''}>
      ${s.section}-${s.row_label}-${s.seat_number} (${s.price})
     </button>`
  ).join('');
}

document.addEventListener('click', async e => {
  if (e.target.tagName === 'BUTTON' && e.target.dataset.id) {
    const eventId = document.getElementById('eventId').value;
    const seatId = +e.target.dataset.id;
    const r = await fetch(`/api/events/${eventId}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ seatIds: [seatId] })
    });
    const d = await r.json();
    alert(r.ok ? 'Order #' + d.id : d.error);
    loadSeats();
  }
});
