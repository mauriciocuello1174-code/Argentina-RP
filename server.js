const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');

loadEnvFile();

const port = Number(process.env.PORT || 3000);
const publicRoot = __dirname;
const sessions = new Map();
const staffRoles = new Set(['CEO', 'OWNER', 'MANAGER', 'ADMINISTRADOR', 'MODERADOR', 'SOPORTE']);
const dataFile = path.join(__dirname, 'data.json');
let data = loadData();

function loadData() {
  try {
    const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    return { tickets: Array.isArray(parsed.tickets) ? parsed.tickets : [], audit: Array.isArray(parsed.audit) ? parsed.audit : [] };
  } catch {
    return { tickets: [], audit: [] };
  }
}

function saveData() {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf8');
}

function loadEnvFile() {
  const file = path.join(__dirname, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([\w]+)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}

function requiredConfig() {
  return ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_REDIRECT_URI', 'DISCORD_GUILD_ID', 'DISCORD_BOT_TOKEN', 'SESSION_SECRET']
    .filter(key => !process.env[key] || process.env[key].startsWith('tu_') || process.env[key].includes('cambia-esta'));
}

function cookieValue(request, name) {
  const cookies = request.headers.cookie || '';
  const match = cookies.split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function setCookie(response, name, value, options = '') {
  response.setHeader('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax${options}`);
}

function json(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(payload));
}

function requestBody(request) {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.on('data', chunk => {
      raw += chunk;
      if (raw.length > 100000) request.destroy(new Error('Payload demasiado grande.'));
    });
    request.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('JSON inválido.')); }
    });
    request.on('error', reject);
  });
}

function requireSession(request, response) {
  return getSession(request).then(session => {
    if (!session) json(response, 401, { error: 'Sesión de Discord requerida.' });
    return session;
  });
}

function requireStaff(session, response) {
  if (!session?.permissions?.staff) {
    json(response, 403, { error: 'No tenés permisos de staff.' });
    return false;
  }
  return true;
}

function audit(actor, action, details) {
  data.audit.push({ id: crypto.randomUUID(), actorId: actor.user.id, actorName: actor.user.displayName, action, details, createdAt: new Date().toISOString() });
  saveData();
}

async function discordRequest(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { Accept: 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Discord devolvió HTTP ${response.status}`);
  return data;
}

async function getSession(request) {
  const id = cookieValue(request, 'arp_session');
  return id ? sessions.get(id) : null;
}

function roleFromDiscord(member, roles) {
  const memberRoleIds = new Set(member.roles || []);
  const assigned = roles.filter(role => memberRoleIds.has(role.id)).sort((a, b) => b.position - a.position);
  return assigned[0]?.name?.toUpperCase() || 'USUARIO';
}

function isStaffMember(member, roles) {
  const configuredIds = new Set((process.env.DISCORD_STAFF_ROLE_IDS || '').split(',').map(value => value.trim()).filter(Boolean));
  return roles.some(role => (configuredIds.has(role.id) || staffRoles.has(role.name.toUpperCase())) && (member.roles || []).includes(role.id));
}

function publicTicket(ticket) {
  return { ...ticket, messages: ticket.messages.map(message => ({ ...message })) };
}

async function discordGuildRoles() {
  return discordRequest(`https://discord.com/api/guilds/${process.env.DISCORD_GUILD_ID}/roles`, { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } });
}

async function updateDiscordMemberRole(targetUserId, roleId, action) {
  const member = await discordRequest(`https://discord.com/api/guilds/${process.env.DISCORD_GUILD_ID}/members/${targetUserId}`, { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } });
  const endpoint = `https://discord.com/api/guilds/${process.env.DISCORD_GUILD_ID}/members/${targetUserId}/roles/${roleId}`;
  const response = await fetch(endpoint, { method: action === 'promote' ? 'PUT' : 'DELETE', headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } });
  if (!response.ok) throw new Error(`Discord no pudo actualizar el rol (HTTP ${response.status}).`);
  return member;
}

async function authCallback(url, request, response) {
  const missing = requiredConfig();
  if (missing.length) return json(response, 500, { error: `Faltan variables de entorno: ${missing.join(', ')}` });
  if (!url.searchParams.get('code')) return json(response, 400, { error: 'Discord no devolvió un código de autorización.' });
  const body = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    client_secret: process.env.DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code: url.searchParams.get('code'),
    redirect_uri: process.env.DISCORD_REDIRECT_URI
  });
  try {
    const token = await discordRequest('https://discord.com/api/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const user = await discordRequest('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${token.access_token}` } });
    const member = await discordRequest(`https://discord.com/api/guilds/${process.env.DISCORD_GUILD_ID}/members/${user.id}`, { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } });
    const roles = await discordRequest(`https://discord.com/api/guilds/${process.env.DISCORD_GUILD_ID}/roles`, { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } });
    const role = roleFromDiscord(member, roles);
    const sessionId = crypto.randomBytes(32).toString('hex');
    sessions.set(sessionId, {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.global_name || user.username,
        avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : 'assets/avatar.svg',
        role
      },
      permissions: { staff: isStaffMember(member, roles) },
      createdAt: Date.now()
    });
    const secure = request.socket.encrypted || request.headers['x-forwarded-proto'] === 'https';
    setCookie(response, 'arp_session', sessionId, `; Max-Age=86400${secure ? '; Secure' : ''}`);
    response.writeHead(302, { Location: '/' });
    response.end();
  } catch (error) {
    json(response, 502, { error: `No se pudo validar Discord: ${error.message}` });
  }
}

function serveStatic(url, response) {
  const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.resolve(publicRoot, `.${requested}`);
  if (!file.startsWith(path.resolve(publicRoot)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return json(response, 404, { error: 'Recurso no encontrado.' });
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
  response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (url.pathname === '/api/auth/discord') {
    const missing = requiredConfig();
    if (missing.length) return json(response, 500, { error: `Configurá Discord en .env: ${missing.join(', ')}` });
    const params = new URLSearchParams({ client_id: process.env.DISCORD_CLIENT_ID, response_type: 'code', redirect_uri: process.env.DISCORD_REDIRECT_URI, scope: 'identify' });
    response.writeHead(302, { Location: `https://discord.com/oauth2/authorize?${params}` });
    return response.end();
  }
  if (url.pathname === '/api/auth/callback') return authCallback(url, request, response);
  if (url.pathname === '/api/auth/me') {
    const session = await getSession(request);
    return session ? json(response, 200, { authenticated: true, user: session.user, permissions: session.permissions }) : json(response, 401, { authenticated: false });
  }
  if (url.pathname === '/api/auth/logout') {
    const id = cookieValue(request, 'arp_session');
    if (id) sessions.delete(id);
    const secure = request.socket.encrypted || request.headers['x-forwarded-proto'] === 'https';
    setCookie(response, 'arp_session', '', `; Max-Age=0${secure ? '; Secure' : ''}`);
    response.writeHead(302, { Location: '/' });
    return response.end();
  }
  if (url.pathname === '/api/discord/roles') {
    const session = await getSession(request);
    if (!session) return json(response, 401, { error: 'Sesión de Discord requerida.' });
    try {
      const roles = await discordGuildRoles();
      return json(response, 200, roles.filter(role => !role.managed && role.name !== '@everyone').sort((a, b) => b.position - a.position).map(role => ({ id: role.id, name: role.name, position: role.position })));
    } catch (error) {
      return json(response, 502, { error: `No se pudieron cargar los rangos de Discord: ${error.message}` });
    }
    if (url.pathname === '/api/tickets' && request.method === 'GET') {
      const session = await requireSession(request, response);
      if (!session) return;
      const visibleTickets = session.permissions.staff ? data.tickets : data.tickets.filter(ticket => ticket.ownerId === session.user.id);
      return json(response, 200, visibleTickets.map(publicTicket));
    }
    if (url.pathname === '/api/tickets' && request.method === 'POST') {
      const session = await requireSession(request, response);
      if (!session) return;
      try {
        const body = await requestBody(request);
        if (!body.subject?.trim() || !body.category?.trim() || !body.description?.trim()) return json(response, 400, { error: 'Asunto, categoría y descripción son obligatorios.' });
        const ticket = {
          id: `TK-${String(Date.now()).slice(-7)}`, ownerId: session.user.id, ownerName: session.user.displayName,
          subject: body.subject.trim(), category: body.category.trim(), status: 'Abierto', assignedTo: null,
          createdAt: new Date().toISOString(), messages: [{ id: crypto.randomUUID(), authorId: session.user.id, authorName: session.user.displayName, avatar: session.user.avatar, body: body.description.trim(), createdAt: new Date().toISOString() }]
        };
        data.tickets.unshift(ticket); audit(session, 'ticket.created', { ticketId: ticket.id }); return json(response, 201, publicTicket(ticket));
      } catch (error) { return json(response, 400, { error: error.message }); }
    }
    const ticketMatch = url.pathname.match(/^\/api\/tickets\/([^/]+)(?:\/(message|claim|close))?$/);
    if (ticketMatch) {
      const session = await requireSession(request, response);
      if (!session) return;
      const ticket = data.tickets.find(item => item.id === ticketMatch[1]);
      if (!ticket) return json(response, 404, { error: 'Ticket no encontrado.' });
      if (ticket.ownerId !== session.user.id && !session.permissions.staff) return json(response, 403, { error: 'No podés acceder a este ticket.' });
      const operation = ticketMatch[2];
      if (request.method === 'GET' && !operation) return json(response, 200, publicTicket(ticket));
      if (request.method !== 'POST') return json(response, 405, { error: 'Método no permitido.' });
      if (operation === 'message') {
        const body = await requestBody(request);
        if (!body.body?.trim()) return json(response, 400, { error: 'El mensaje no puede estar vacío.' });
        ticket.messages.push({ id: crypto.randomUUID(), authorId: session.user.id, authorName: session.user.displayName, avatar: session.user.avatar, body: body.body.trim(), createdAt: new Date().toISOString() });
        audit(session, 'ticket.message', { ticketId: ticket.id }); saveData(); return json(response, 200, publicTicket(ticket));
      }
      if (operation === 'claim') {
        if (!requireStaff(session, response)) return;
        ticket.assignedTo = { id: session.user.id, name: session.user.displayName }; ticket.status = 'En atención';
        audit(session, 'ticket.claimed', { ticketId: ticket.id }); saveData(); return json(response, 200, publicTicket(ticket));
      }
      if (operation === 'close') {
        ticket.status = 'Cerrado'; ticket.closedAt = new Date().toISOString();
        audit(session, 'ticket.closed', { ticketId: ticket.id }); saveData(); return json(response, 200, publicTicket(ticket));
      }
    }
    if (url.pathname === '/api/staff/promotions' && request.method === 'GET') {
      const session = await requireSession(request, response);
      if (!session || !requireStaff(session, response)) return;
      return json(response, 200, data.audit.filter(item => item.action.startsWith('staff.')).slice(-100).reverse());
    }
    if (url.pathname === '/api/staff/promotions' && request.method === 'POST') {
      const session = await requireSession(request, response);
      if (!session || !requireStaff(session, response)) return;
      try {
        const body = await requestBody(request);
        if (!body.targetUserId || !body.roleId || !['promote', 'demote'].includes(body.action)) return json(response, 400, { error: 'Usuario, rango y acción son obligatorios.' });
        const roles = await discordGuildRoles();
        const role = roles.find(item => item.id === body.roleId && !item.managed && item.name !== '@everyone');
        if (!role) return json(response, 400, { error: 'Ese rango no existe en el servidor.' });
        const actorRole = roles.find(item => item.name.toUpperCase() === session.user.role);
        if (actorRole && role.position >= actorRole.position) return json(response, 403, { error: 'No podés modificar un rango igual o superior al tuyo.' });
        await updateDiscordMemberRole(body.targetUserId, body.roleId, body.action);
        audit(session, `staff.${body.action}`, { targetUserId: body.targetUserId, roleId: role.id, roleName: role.name });
        return json(response, 200, { ok: true, role: { id: role.id, name: role.name, position: role.position } });
      } catch (error) { return json(response, 502, { error: error.message }); }
    }
  }
  if (url.pathname.startsWith('/api/')) return json(response, 401, { error: 'Sesión de Discord requerida.' });
  serveStatic(url, response);
});

server.listen(port, () => console.log(`Argentina Roleplay en http://localhost:${port}`));
