const state = {
  view: 'home',
  user: null,
  tickets: [],
  reports: [],
  roles: []
};

const container = document.getElementById('viewContainer');
const titles = { home:'Inicio', profile:'Mi perfil', tickets:'Mis tickets', reports:'Reportes', sanctions:'Mis sanciones', notifications:'Notificaciones', news:'Noticias', admin:'Administración', investigations:'Investigaciones', settings:'Configuración' };
const authGate = document.getElementById('authGate');
const authError = document.getElementById('authError');

function applyUser(user) {
  if (!user) return;
  state.user = user;
  document.querySelector('.user-trigger img').src = user.avatar || 'assets/avatar.svg';
  document.querySelector('.user-trigger b').textContent = user.displayName || user.username;
  document.querySelector('.user-trigger small').textContent = user.role || 'USUARIO';
  document.querySelectorAll('.user-trigger img, .profile-card img').forEach(image => image.alt = `Avatar de ${user.displayName || user.username}`);
}

async function requireDiscordSession() {
  document.body.classList.add('auth-locked');
  try {
    const response = await fetch('/api/auth/me', { credentials: 'include', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('No hay una sesión de Discord activa.');
    const session = await response.json();
    if (!session.authenticated || !session.user) throw new Error('No hay una sesión de Discord activa.');
    applyUser(session.user);
    state.roles = await fetch('/api/discord/roles', { credentials: 'include' }).then(response => response.ok ? response.json() : []);
    state.tickets = await fetch('/api/tickets', { credentials: 'include' }).then(response => response.ok ? response.json() : []);
    document.querySelectorAll('.staff-only').forEach(item => {
      item.hidden = !session.permissions?.staff;
    });
    authGate.remove();
    document.body.classList.remove('auth-locked');
    render();
  } catch (error) {
    authError.textContent = 'No se pudo validar tu sesión. Iniciá sesión con Discord para continuar.';
    authError.hidden = false;
  }
}

function layout(title, subtitle, action = '') {
  return `<section class="view"><div class="page-heading"><div><span class="eyebrow">ARGENTINA ROLEPLAY / ${title.toUpperCase()}</span><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
}
function panel(title, body, extra='') { return `<div class="panel"><div class="panel-heading"><h2>${title}</h2>${extra}</div>${body}</div>`; }
function stat(label, value, note, icon) { return `<div class="stat-card"><small>${label}</small><strong>${value}</strong><span>${icon}</span><p>${note}</p></div>`; }
function status(text) { const type = text.toLowerCase().includes('resuelt') || text.toLowerCase().includes('activa') ? 'green' : text.toLowerCase().includes('esper') || text.toLowerCase().includes('pend') ? 'yellow' : ''; return `<span class="badge ${type}">${text}</span>`; }
function roleHierarchy() {
  if (!state.roles.length) return '<div class="empty">No hay rangos configurados en el servidor de Discord.</div>';
  return panel('Jerarquía de rangos de Discord', `<div class="role-list">${state.roles.map((role, index) => `<div class="role-row"><span class="role-position">${index + 1}</span><b>${role.name}</b><small>${role.memberCount ?? 0} miembros</small></div>`).join('')}</div>`);
}

function home() {
  return layout('Inicio', 'Todo lo que necesitás para formar parte de nuestra comunidad.', '') +
    `<div class="hero"><div class="hero-content"><span class="eyebrow">PORTAL OFICIAL</span><h1>Argentina Roleplay.</h1><p>Configurá la información de tu comunidad desde el panel.</p><div class="hero-actions"><button class="btn" id="connectBtn">Conectar al servidor</button><button class="btn secondary" id="discordBtn">Unirse a Discord ↗</button></div><div class="status-row"><span class="dot"></span><strong>CONFIGURAR</strong><span>Estado del servidor pendiente de configuración</span></div></div></div>
    <div class="stats-grid">${stat('Jugadores conectados','—','Sin configurar','♟')}${stat('Usuarios registrados','—','Sin configurar','♙')}${stat('Tickets atendidos','—','Sin datos','▣')}${stat('Tiempo online','—','Sin datos','◷')}</div>
    <div class="content-grid">${panel('Noticias', '<div class="empty">Todavía no hay noticias publicadas.</div>', '<a data-view="news">Gestionar →</a>')}${panel('Actividad reciente', '<div class="empty">Todavía no hay actividad registrada.</div>', '<a data-view="notifications">Ver todo →</a>')}</div></section>`;
}
function profile() { const user = state.user || {}; return layout('Mi perfil','Tu información personal y preferencias dentro de la comunidad.') + `<div class="panel profile-card"><img src="${user.avatar || 'assets/avatar.svg'}" alt="Avatar de ${user.displayName || user.username || 'usuario'}"><div><span class="eyebrow">CUENTA VERIFICADA</span><h2>${user.displayName || user.username || 'Usuario de Discord'}</h2><p>@${user.username || 'usuario'} · Discord ID: ${user.id || 'No disponible'}</p>${status('Cuenta activa')}</div><button class="btn secondary" style="margin-left:auto" id="editProfile">Editar perfil</button></div><div class="profile-grid">${panel('Información de cuenta', `<div class="info-list"><div class="info-row"><span>Nombre visible</span><b>${user.displayName || user.username || 'No disponible'}</b></div><div class="info-row"><span>Discord</span><b>@${user.username || 'No disponible'}</b></div><div class="info-row"><span>Discord ID</span><b>${user.id || 'No disponible'}</b></div><div class="info-row"><span>Rango</span><b>${user.role || 'USUARIO'}</b></div></div>`)}${roleHierarchy()}</div></section>`; }
function tickets() { return layout('Mis tickets','Contactá al equipo de soporte y seguí tus consultas.', '<button class="btn" id="newTicket">+ Crear ticket</button>') + `<div class="ticket-list">${state.tickets.length ? state.tickets.map(t => `<div class="panel ticket-card"><div><h3>${t.subject}</h3><p>#${t.id} · ${t.category} · ${t.ownerName}</p><small class="muted">${t.messages.length} mensaje${t.messages.length === 1 ? '' : 's'}</small></div><div class="ticket-side">${status(t.status)}${state.user?.role !== 'USUARIO' ? `<div class="ticket-actions"><button class="btn secondary ticket-action" data-action="claim" data-ticket="${t.id}">Reclamar</button><button class="btn secondary ticket-action" data-action="close" data-ticket="${t.id}">Cerrar</button></div>` : ''}<small>${new Date(t.createdAt).toLocaleString('es-AR')}</small></div></div>`).join('') : '<div class="panel empty">No hay tickets registrados.</div>'}</div></section>`; }
function reports() { return layout('Reportes','Informá situaciones y ayudanos a mantener la comunidad.', '<button class="btn" id="newReport">+ Nuevo reporte</button>') + panel('Mis reportes', state.reports.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Identificador</th><th>Situación</th><th>Tipo</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>${state.reports.map(r => `<tr><td><b>${r.id}</b></td><td>${r.target}</td><td>${r.type}</td><td>${status(r.status)}</td><td>${r.date}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No hay reportes registrados.</div>') + `</section>`; }
function sanctions() { return layout('Mis sanciones','Consultá tu historial de moderación de forma privada.') + panel('Historial de sanciones', '<div class="empty">No hay sanciones registradas para tu cuenta.</div>') + `<div class="role-hierarchy">${roleHierarchy()}</div>`; }
function notifications() { return layout('Notificaciones','Mantenete al día con toda la actividad de tu cuenta.') + panel('Recientes', '<div class="empty">No hay notificaciones.</div>') + `</section>`; }
function news() { return layout('Noticias','Novedades, eventos y comunicados oficiales de Argentina Roleplay.') + panel('Publicaciones', '<div class="empty">Todavía no hay publicaciones.</div>') + `</section>`; }
function admin() { return layout('Administración','Centro de gestión interna.') + `<div class="admin-grid">${stat('Usuarios registrados','—','Sin datos','♙')}${stat('Tickets abiertos',String(state.tickets.filter(ticket => ticket.status !== 'Cerrado').length),'Datos actuales','▣')}${stat('Reportes pendientes','—','Sin datos','⚑')}${stat('Staff conectado','—','Sin datos','●')}</div>${panel('Ascensos y descensos', `<div class="form-grid"><div class="form-field"><label>ID de usuario de Discord</label><input id="staffTarget" placeholder="Ej: 123456789012345678"></div><div class="form-field"><label>Rango de Discord</label><select id="staffRole">${state.roles.map(role => `<option value="${role.id}">${role.name}</option>`).join('')}</select></div><div class="form-field full"><div class="modal-actions" style="padding:0"><button class="btn secondary" id="demoteStaff">Descender / quitar rango</button><button class="btn" id="promoteStaff">Ascender / asignar rango</button></div></div></div>`)}${panel('Actividad del equipo', '<div class="empty">No hay actividad registrada.</div>')}${roleHierarchy()}</section>`; }
function investigations() { return layout('Investigaciones','Casos privados asignados al equipo de moderación.', '<button class="btn" id="newInvestigation">+ Nueva investigación</button>') + panel('Casos activos', '<div class="empty">No hay investigaciones registradas.</div>') + `</section>`; }
function settings() { return layout('Configuración','Personalizá tu experiencia en la plataforma.') + panel('Preferencias', `<div class="info-list"><div class="info-row"><span>Notificaciones por email</span><button class="btn secondary">Activadas</button></div><div class="info-row"><span>Zona horaria</span><b>Argentina (GMT-3)</b></div><div class="info-row"><span>Idioma</span><b>Español (Argentina)</b></div></div>`) + `</section>`; }

function render() {
  const views = { home, profile, tickets, reports, sanctions, notifications, news, admin, investigations, settings };
  container.innerHTML = views[state.view]();
  document.getElementById('pageTitle').textContent = titles[state.view];
  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.view === state.view));
  bindViewActions();
}
function showToast(message) { const toast = document.getElementById('toast'); toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2800); }
function openModal(type) {
  const modal = document.getElementById('modal');
  const isTicket = type === 'ticket';
  modal.innerHTML = `<div class="modal-head"><h2>${isTicket ? 'Crear nuevo ticket' : type === 'report' ? 'Crear reporte' : 'Nueva investigación'}</h2><button class="close" id="closeModal">×</button></div><div class="form-grid"><div class="form-field"><label>${isTicket ? 'Categoría' : 'Tipo'}</label><select><option>Soporte general</option><option>Problemas técnicos</option><option>Reportar jugador</option><option>Apelación de sanciones</option></select></div><div class="form-field"><label>Asunto</label><input placeholder="Escribí un asunto claro"></div><div class="form-field full"><label>Descripción</label><textarea placeholder="Contanos todos los detalles que puedan ayudarnos..."></textarea></div></div><div class="modal-actions"><button class="btn secondary" id="cancelModal">Cancelar</button><button class="btn" id="submitModal">${isTicket ? 'Crear ticket' : 'Enviar solicitud'}</button></div>`;
  document.getElementById('modalBackdrop').classList.add('open');
  document.getElementById('closeModal').onclick = closeModal; document.getElementById('cancelModal').onclick = closeModal;
  document.getElementById('submitModal').onclick = async () => {
    const fields = modal.querySelectorAll('input, select, textarea');
    const category = fields[0].value;
    const subject = fields[1].value;
    const description = fields[2].value;
    if (isTicket) {
      const response = await fetch('/api/tickets', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category, subject, description }) });
      const result = await response.json();
      if (!response.ok) return showToast(result.error || 'No se pudo crear el ticket.');
      state.tickets.unshift(result); closeModal(); render(); showToast('Ticket creado correctamente.');
    } else { closeModal(); showToast('Solicitud enviada correctamente.'); }
  };
}
function closeModal() { document.getElementById('modalBackdrop').classList.remove('open'); }
function bindViewActions() {
  document.querySelectorAll('[data-view]').forEach(btn => btn.onclick = () => { state.view = btn.dataset.view; document.getElementById('sidebar').classList.remove('open'); render(); });
  document.getElementById('newTicket')?.addEventListener('click', () => openModal('ticket'));
  document.getElementById('newReport')?.addEventListener('click', () => openModal('report'));
  document.getElementById('newInvestigation')?.addEventListener('click', () => openModal('investigation'));
  document.getElementById('connectBtn')?.addEventListener('click', () => showToast('Copiamos la IP del servidor: play.argentinarp.com:30120'));
  document.getElementById('discordBtn')?.addEventListener('click', () => showToast('Invitación de Discord lista para abrir.'));
  document.getElementById('readAll')?.addEventListener('click', () => showToast('Notificaciones marcadas como leídas.'));
  document.getElementById('editProfile')?.addEventListener('click', () => showToast('La edición de perfil estará disponible próximamente.'));
  document.getElementById('promoteStaff')?.addEventListener('click', () => updateStaffRole('promote'));
  document.getElementById('demoteStaff')?.addEventListener('click', () => updateStaffRole('demote'));
  document.querySelectorAll('.ticket-action').forEach(button => button.addEventListener('click', () => updateTicket(button.dataset.ticket, button.dataset.action)));
}
async function updateTicket(id, action) {
  const response = await fetch(`/api/tickets/${encodeURIComponent(id)}/${action}`, { method: 'POST', credentials: 'include' });
  const result = await response.json();
  if (!response.ok) return showToast(result.error || 'No se pudo actualizar el ticket.');
  state.tickets = state.tickets.map(ticket => ticket.id === id ? result : ticket);
  render();
  showToast(action === 'claim' ? 'Ticket reclamado correctamente.' : 'Ticket cerrado correctamente.');
}
async function updateStaffRole(action) {
  const targetUserId = document.getElementById('staffTarget')?.value.trim();
  const roleId = document.getElementById('staffRole')?.value;
  if (!targetUserId || !roleId) return showToast('Completá el usuario y el rango.');
  const response = await fetch('/api/staff/promotions', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetUserId, roleId, action }) });
  const result = await response.json();
  showToast(response.ok ? `Rango ${action === 'promote' ? 'asignado' : 'retirado'} correctamente.` : (result.error || 'No se pudo actualizar el rango.'));
}
document.getElementById('menuBtn').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
document.querySelector('.user-trigger').addEventListener('click', () => document.querySelector('.user-menu').classList.toggle('open'));
function logout() {
  window.location.assign('/api/auth/logout');
}
document.getElementById('logoutBtn').addEventListener('click', logout);
document.getElementById('dropdownLogout').addEventListener('click', logout);
document.getElementById('modalBackdrop').addEventListener('click', e => { if (e.target.id === 'modalBackdrop') closeModal(); });
requireDiscordSession();
