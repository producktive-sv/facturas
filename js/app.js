/* ============================================
 * GESTOR DE FACTURACIÓN proDUCKtive
 * Lógica completa (SPA vanilla + Supabase)
 * ============================================ */
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------- Estado global ---------- */
let session = null;
let cfg = null;

/* ---------- Utilidades ---------- */
const $ = (sel) => document.querySelector(sel);
const fmt = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todayStr = () => new Date().toISOString().slice(0, 10);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TIPOS = { PROFORMA: 'Proforma', FCF: 'Factura (FCF)', CCF: 'Crédito Fiscal (CCF)', NC: 'Nota de Crédito', ND: 'Nota de Débito', FSE: 'Sujeto Excluido (FSE)', FEX: 'Exportación (FEX)', TCF: 'Tiquete (TCF)' };
const ESTADOS = ['EMITIDA', 'ANULADA', 'PROFORMA'];

function numToWords(n) {
  const u = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
  const d = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const c = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
  const tres = (x) => {
    if (!x) return '';
    let s = '';
    const ce = Math.floor(x / 100), re = x % 100;
    if (ce) s += (ce === 1 && re === 0 ? 'CIEN' : c[ce]) + (re ? ' ' : '');
    if (re) {
      if (re < 20) s += (s ? ' ' : '') + u[re];
      else {
        const de = Math.floor(re / 10), uu = re % 10;
        s += (s ? ' ' : '') + d[de] + (uu ? (de === 2 ? ' Y ' : ' ') + u[uu] : '');
      }
    }
    return s;
  };
  const mill = Math.floor(n / 1000000), mil = Math.floor((n % 1000000) / 1000), resto = Math.floor(n % 1000);
  let w = '';
  if (mill) w += (mill === 1 ? 'UN MILLÓN' : tres(mill) + ' MILLONES') + (mil || resto ? ' ' : '');
  if (mil) w += (mil === 1 ? 'MIL' : tres(mil) + ' MIL') + (resto ? ' ' : '');
  if (resto) w += tres(resto);
  return w || 'CERO';
}
const totalLetras = (total) => {
  const entero = Math.floor(total), cent = Math.round((total - entero) * 100);
  return `SON ${numToWords(entero)} DÓLARES CON ${String(cent).padStart(2, '0')}/100`;
};

/* ---------- Auditoría ---------- */
async function audit(accion, tabla, idRegistro, detalle) {
  try {
    await supabase.from('fac_auditoria').insert({
      accion, tabla, id_registro: idRegistro,
      detalle: detalle || null,
      creado_por: session?.user?.email || 'desconocido',
    });
  } catch (e) { console.warn('audit fail', e); }
}

/* ---------- Modal ---------- */
function openModal(html, onMount) {
  $('#modal-root').innerHTML = `<div class="modal-backdrop"><div class="modal">${html}</div></div>`;
  $('#modal-root').querySelector('.modal-backdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
  if (onMount) onMount($('#modal-root'));
}
function closeModal() { $('#modal-root').innerHTML = ''; }

/* ---------- Navegación ---------- */
function router() {
  const hash = location.hash || '#/dashboard';
  const [rawPath, ...rest] = hash.slice(1).split('/');
  const path = rawPath.split('?')[0]; // quitar query (?cliente=N)
  const param = rest.join('/');
  document.querySelectorAll('.nav-links a').forEach(a => a.classList.toggle('active', a.dataset.nav === path));
  if (!session) { showLogin(); return; }
  showApp();
  if (path === 'dashboard') viewDashboard();
  else if (path === 'facturas') viewFacturas();
  else if (path === 'nueva') viewNueva();
  else if (path === 'factura') viewDetalle(param);
  else if (path === 'clientes') viewClientes();
  else if (path === 'recibidas') viewRecibidas();
  else if (path === 'config') viewConfig();
  else if (path === 'auditoria') viewAuditoria();
  else viewDashboard();
}

/* ---------- Auth ---------- */
function showLogin() {
  $('#view-login').classList.remove('hidden');
  $('#view-app').classList.add('hidden');
}
function showApp() {
  $('#view-login').classList.add('hidden');
  $('#view-app').classList.remove('hidden');
  $('#nav-user-email').textContent = session.user.email;
}

$('#btn-login').addEventListener('click', async () => {
  const email = $('#login-email').value.trim(), pass = $('#login-pass').value;
  const err = $('#login-error');
  err.classList.add('hidden');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
  if (error) { err.textContent = 'Error: ' + error.message; err.classList.remove('hidden'); return; }
  session = data.session;
  router();
});
$('#btn-logout').addEventListener('click', async () => {
  await supabase.auth.signOut();
  session = null; cfg = null;
  location.hash = '#/dashboard';
  router();
});

/* ---------- Config (banner modo) ---------- */
async function loadConfig() {
  const { data } = await supabase.from('fac_config').select('*').eq('id', 1).maybeSingle();
  cfg = data || {};
  return cfg;
}
function renderBanner() {
  const b = $('#modo-banner');
  if (!cfg) { b.classList.add('hidden'); return; }
  if (!cfg.nrc) {
    b.className = 'banner proforma';
    b.innerHTML = '🟡 <b>Modo PROFORMA</b> — Aún sin NRC: los documentos que generes <b>no tienen valor tributario</b> (valen como cotización/proforma). Al inscribir tu NRC en <b>Config</b>, se activa el modo DTE oficial.';
    b.classList.remove('hidden');
  } else {
    b.className = 'banner dte';
    b.innerHTML = '🟢 <b>Modo DTE activo</b> — NRC ' + esc(cfg.nrc) + ' registrado. Los documentos se emiten como facturación electrónica.';
    b.classList.remove('hidden');
  }
}

/* ============================================
 * VISTAS
 * ============================================ */

/* ---------- Dashboard ---------- */
async function viewDashboard() {
  cfg = await loadConfig();
  renderBanner();
  const hoy = new Date();
  const mesIni = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
  const mesFin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().slice(0, 10);

  const [facMes, totales, clientes, recientes] = await Promise.all([
    supabase.from('fac_facturas').select('*').gte('fecha_emision', mesIni).lte('fecha_emision', mesFin).neq('estado', 'ANULADA'),
    supabase.from('fac_facturas').select('total, iva'),
    supabase.from('fac_clientes').select('id', { count: 'exact', head: true }),
    supabase.from('fac_facturas').select('*').order('fecha_emision', { ascending: false }).order('id', { ascending: false }).limit(5),
  ]);

  const ventasMes = (facMes.data || []).reduce((a, f) => a + Number(f.total), 0);
  const ivaMes = (facMes.data || []).reduce((a, f) => a + Number(f.iva), 0);
  const ventasTotales = (totales.data || []).reduce((a, f) => a + Number(f.total), 0);
  const nFacturas = (totales.data || []).length;

  $('#app-main').innerHTML = `
    <div class="page-head"><div><h2>Panel general</h2><p>Resumen de facturación del universo proDUCKtive</p></div></div>
    <div class="stats-row">
      <div class="stat"><div class="stat-label">Ventas del mes</div><div class="stat-value">${fmt(ventasMes)}</div><div class="stat-sub">IVA del mes: ${fmt(ivaMes)}</div></div>
      <div class="stat"><div class="stat-label">Facturas emitidas</div><div class="stat-value">${nFacturas}</div><div class="stat-sub">Histórico total</div></div>
      <div class="stat"><div class="stat-label">Ventas históricas</div><div class="stat-value">${fmt(ventasTotales)}</div><div class="stat-sub">Sin anuladas</div></div>
      <div class="stat"><div class="stat-label">Clientes registrados</div><div class="stat-value">${clientes.count ?? 0}</div><div class="stat-sub">En tu registro</div></div>
    </div>
    <div class="card">
      <div class="flex-between mb"><div class="card-title">Últimas facturas</div>
        <a href="#/facturas" class="btn btn-ghost btn-small">Ver todas →</a></div>
      ${(recientes.data || []).length ? `
      <div class="table-wrap"><table>
        <tr><th>Número</th><th>Tipo</th><th>Fecha</th><th>Cliente</th><th class="num">Total</th><th>Estado</th></tr>
        ${(recientes.data || []).map(f => `<tr onclick="location.hash='#/factura/${f.id}'" style="cursor:pointer">
          <td>${esc(f.numero)}</td><td><span class="badge ${f.tipo}">${TIPOS[f.tipo] || f.tipo}</span></td>
          <td>${esc(f.fecha_emision)}</td><td>${esc(f.nombre_cliente || 'Consumidor final')}</td>
          <td class="num">${fmt(f.total)}</td><td><span class="badge ${f.estado}">${f.estado}</span></td>
        </tr>`).join('')}
      </table></div>` : `<div class="empty">Aún no hay facturas. <a href="#/nueva">Crea la primera →</a></div>`}
    </div>`;
}

/* ---------- Facturas (lista + buscador) ---------- */
let facturasCache = [];

async function viewFacturas() {
  cfg = await loadConfig();
  renderBanner();
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const preselCliente = params.get('cliente');

  const anios = []; for (let y = hoy().getFullYear(); y >= 2024; y--) anios.push(y);
  const meses = [['01', 'Enero'], ['02', 'Febrero'], ['03', 'Marzo'], ['04', 'Abril'], ['05', 'Mayo'], ['06', 'Junio'], ['07', 'Julio'], ['08', 'Agosto'], ['09', 'Septiembre'], ['10', 'Octubre'], ['11', 'Noviembre'], ['12', 'Diciembre']];

  $('#app-main').innerHTML = `
    <div class="page-head"><div><h2>Facturas emitidas</h2><p>Histórico completo con buscador</p></div>
      <div class="flex">
        <button class="btn btn-ghost" onclick="exportarCSV()">⬇ CSV</button>
        <button class="btn btn-ghost" onclick="exportarJSON()">⬇ JSON</button>
        <a href="#/nueva" class="btn btn-pink">+ Nueva factura</a>
      </div></div>
    <div class="card">
      <div class="filters">
        <select id="f-tipo"><option value="">Tipo (todos)</option>${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        <select id="f-estado"><option value="">Estado (todos)</option>${ESTADOS.map(e => `<option value="${e}">${e}</option>`).join('')}</select>
        <select id="f-anio"><option value="">Año (todos)</option>${anios.map(y => `<option value="${y}">${y}</option>`).join('')}</select>
        <select id="f-mes"><option value="">Mes (todos)</option>${meses.map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        <input type="date" id="f-dia" title="Día exacto">
        <input type="search" id="f-texto" placeholder="🔍 Cliente, NIT o número..." value="">
        <input type="number" id="f-min" placeholder="Monto mín" style="width:110px" step="0.01">
        <input type="number" id="f-max" placeholder="Monto máx" style="width:110px" step="0.01">
        <button class="btn btn-ghost" onclick="aplicarFiltros()">Filtrar</button>
        <button class="btn btn-ghost" onclick="limpiarFiltros()">Limpiar</button>
      </div>
      <div id="facturas-tabla"><div class="empty">Cargando...</div></div>
    </div>`;

  // filtro preseleccionado de cliente
  if (preselCliente) {
    const { data: cli } = await supabase.from('fac_clientes').select('nombre').eq('id', preselCliente).maybeSingle();
    if (cli) $('#f-texto').value = cli.nombre;
  }

  await cargarFacturas();
  ['f-tipo', 'f-estado', 'f-anio', 'f-mes', 'f-dia'].forEach(id => $('#' + id).addEventListener('change', aplicarFiltros));
  $('#f-texto').addEventListener('keydown', e => { if (e.key === 'Enter') aplicarFiltros(); });
  $('#f-min').addEventListener('keydown', e => { if (e.key === 'Enter') aplicarFiltros(); });
  $('#f-max').addEventListener('keydown', e => { if (e.key === 'Enter') aplicarFiltros(); });
}

function hoy() { return new Date(); }
function getFiltros() {
  return {
    tipo: $('#f-tipo')?.value || '', estado: $('#f-estado')?.value || '',
    anio: $('#f-anio')?.value || '', mes: $('#f-mes')?.value || '', dia: $('#f-dia')?.value || '',
    texto: ($('#f-texto')?.value || '').trim(), min: $('#f-min')?.value || '', max: $('#f-max')?.value || '',
  };
}

async function cargarFacturas() {
  const f = getFiltros();
  let q = supabase.from('fac_facturas').select('*').order('fecha_emision', { ascending: false }).order('id', { ascending: false }).limit(500);
  if (f.tipo) q = q.eq('tipo', f.tipo);
  if (f.estado) q = q.eq('estado', f.estado);
  if (f.anio) { q = q.gte('fecha_emision', `${f.anio}-01-01`).lte('fecha_emision', `${f.anio}-12-31`); }
  if (f.mes && f.anio) {
    const fin = new Date(Number(f.anio), Number(f.mes), 0).toISOString().slice(0, 10);
    q = q.gte('fecha_emision', `${f.anio}-${f.mes}-01`).lte('fecha_emision', fin);
  }
  if (f.dia) q = q.eq('fecha_emision', f.dia);
  if (f.min) q = q.gte('total', Number(f.min));
  if (f.max) q = q.lte('total', Number(f.max));
  if (f.texto) q = q.or(`nombre_cliente.ilike.%${f.texto}%,nit_cliente.ilike.%${f.texto}%,numero.ilike.%${f.texto}%`);

  const { data, error } = await q;
  if (error) { $('#facturas-tabla').innerHTML = `<div class="alert alert-danger">${esc(error.message)}</div>`; return; }
  facturasCache = data || [];
  const total = facturasCache.reduce((a, x) => a + Number(x.total), 0);
  $('#facturas-tabla').innerHTML = facturasCache.length ? `
    <div class="small muted mb">${facturasCache.length} resultados · Total: <b>${fmt(total)}</b></div>
    <div class="table-wrap"><table>
      <tr><th>Número</th><th>Tipo</th><th>Fecha</th><th>Cliente</th><th class="num">Subtotal</th><th class="num">IVA</th><th class="num">Total</th><th>Estado</th></tr>
      ${facturasCache.map(f => `<tr onclick="location.hash='#/factura/${f.id}'" style="cursor:pointer">
        <td>${esc(f.numero)}</td><td><span class="badge ${f.tipo}">${TIPOS[f.tipo] || f.tipo}</span></td>
        <td>${esc(f.fecha_emision)}</td><td>${esc(f.nombre_cliente || 'Consumidor final')}</td>
        <td class="num">${fmt(f.subtotal)}</td><td class="num">${fmt(f.iva)}</td><td class="num"><b>${fmt(f.total)}</b></td>
        <td><span class="badge ${f.estado}">${f.estado}</span></td>
      </tr>`).join('')}
    </table></div>` : `<div class="empty">No hay facturas que coincidan con los filtros.</div>`;
}
function aplicarFiltros() { cargarFacturas(); }
function limpiarFiltros() {
  ['f-tipo', 'f-estado', 'f-anio', 'f-mes', 'f-dia', 'f-texto', 'f-min', 'f-max'].forEach(id => { const el = $('#' + id); if (el) el.value = ''; });
  cargarFacturas();
}

function exportarCSV() {
  if (!facturasCache.length) return alert('No hay datos para exportar');
  const cols = ['numero', 'tipo', 'fecha_emision', 'nombre_cliente', 'nit_cliente', 'subtotal', 'iva', 'total', 'estado', 'observaciones'];
  const csv = [cols.join(',')].concat(facturasCache.map(f =>
    cols.map(c => `"${String(f[c] ?? '').replace(/"/g, '""')}"`).join(',')
  )).join('\n');
  descargarArchivo(`facturas_${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv');
  audit('EXPORTAR_CSV', 'fac_facturas', null, { filas: facturasCache.length });
}
function exportarJSON() {
  if (!facturasCache.length) return alert('No hay datos para exportar');
  descargarArchivo(`facturas_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(facturasCache, null, 2), 'application/json');
  audit('EXPORTAR_JSON', 'fac_facturas', null, { filas: facturasCache.length });
}
function descargarArchivo(nombre, contenido, mime) {
  const blob = new Blob([contenido], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombre; a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------- Nueva factura (generador) ---------- */
let clientesCache = [];
let productosCache = [];

async function viewNueva() {
  cfg = await loadConfig();
  renderBanner();
  const [c, p] = await Promise.all([
    supabase.from('fac_clientes').select('*').order('nombre'),
    supabase.from('fac_productos').select('*').eq('activo', true).order('nombre'),
  ]);
  clientesCache = c.data || []; productosCache = p.data || [];

  const tipoDef = cfg.nrc ? 'FCF' : 'PROFORMA';
  $('#app-main').innerHTML = `
    <div class="page-head"><div><h2>Nueva factura</h2><p>Genera el documento para tu cliente</p></div></div>
    ${!cfg.nrc ? `<div class="alert alert-info">ℹ️ Modo <b>PROFORMA</b>: el documento se genera con tus datos y numeración propia, sin valor tributario hasta tener NRC. <a href="#/config">Ver estado en Config</a>.</div>` : ''}
    <div class="card">
      <div class="form-grid">
        <div><label class="field">Tipo de documento</label>
          <select id="n-tipo" class="field">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${k === tipoDef ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div><label class="field">Fecha de emisión</label><input type="date" id="n-fecha" class="field" value="${todayStr()}"></div>
        <div class="full"><label class="field">Cliente (escribe para buscar en tu registro)</label>
          <div class="autocomplete">
            <input type="text" id="n-cliente-busqueda" class="field" placeholder="Buscar por nombre o NIT... (vacío = Consumidor final)" autocomplete="off">
            <div id="n-cliente-ac" class="ac-list hidden"></div>
            <input type="hidden" id="n-cliente-id"><input type="hidden" id="n-cliente-nit"><input type="hidden" id="n-cliente-nombre">
          </div></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Detalle de la factura</div>
      <div class="table-wrap"><table class="items-table" id="items-tabla">
        <tr><th style="width:22%">Producto / servicio</th><th>Descripción</th><th class="qty">Cant</th><th class="price">Precio</th><th class="imp">Impuesto</th><th class="num">Total</th><th></th></tr>
      </table></div>
      <button class="btn-add-line mt" onclick="agregarLinea()">+ Agregar línea</button>
      <div class="totals">
        <div class="row"><span>Subtotal</span><span id="t-subtotal">$0.00</span></div>
        <div class="row"><span>IVA (13%)</span><span id="t-iva">$0.00</span></div>
        <div class="row grand"><span>TOTAL</span><span id="t-total">$0.00</span></div>
      </div>
    </div>
    <div class="card">
      <label class="field">Observaciones (se imprime en la factura)</label>
      <textarea id="n-obs" class="field" rows="2" placeholder="Ej: Venta por pedido online, envío por..."></textarea>
      <div class="flex mt">
        <button class="btn btn-primary" id="btn-guardar-factura">💾 Guardar factura</button>
        <button class="btn btn-ghost" onclick="location.hash='#/facturas'">Cancelar</button>
      </div>
    </div>`;

  agregarLinea();
  $('#n-cliente-busqueda').addEventListener('input', busquedaCliente);
  $('#btn-guardar-factura').addEventListener('click', guardarFactura);
  recalcular();
}

function busquedaCliente() {
  const t = $('#n-cliente-busqueda').value.trim().toLowerCase();
  const box = $('#n-cliente-ac');
  if (!t) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  const res = clientesCache.filter(c => (c.nombre || '').toLowerCase().includes(t) || (c.nit || '').includes(t)).slice(0, 8);
  if (!res.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  box.innerHTML = res.map(c => `<div class="ac-item" onclick="seleccionarCliente(${c.id})">${esc(c.nombre)} <small>${esc(c.nit || '')} ${esc(c.email || '')}</small></div>`).join('');
  box.classList.remove('hidden');
}
function seleccionarCliente(id) {
  const c = clientesCache.find(x => x.id === id);
  if (!c) return;
  $('#n-cliente-id').value = c.id;
  $('#n-cliente-nit').value = c.nit || '';
  $('#n-cliente-nombre').value = c.nombre;
  $('#n-cliente-busqueda').value = c.nombre + (c.nit ? ` (${c.nit})` : '');
  $('#n-cliente-ac').classList.add('hidden');
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('.autocomplete')) $('#n-cliente-ac')?.classList.add('hidden');
});

function agregarLinea(producto) {
  const tbody = $('#items-tabla');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input class="li-prod" list="lista-productos" placeholder="Producto..." value="${esc(producto?.nombre || '')}" autocomplete="off">
      <datalist id="lista-productos">${productosCache.map(p => `<option value="${esc(p.nombre)}" data-id="${p.id}" data-precio="${p.precio}" data-imp="${p.impuesto}">`).join('')}</datalist></td>
    <td><input class="li-desc" placeholder="Descripción" value="${esc(producto?.descripcion || '')}"></td>
    <td><input class="li-qty field qty" type="number" min="0" step="1" value="1"></td>
    <td><input class="li-price field price" type="number" min="0" step="0.01" value="${producto?.precio ?? ''}"></td>
    <td><select class="li-imp field imp"><option value="IVA13">IVA 13%</option><option value="EXENTO">Exento</option><option value="NO_SUJETO">No sujeto</option></select></td>
    <td class="line-total">$0.00</td>
    <td><button class="btn-x" onclick="eliminarLinea(this)">✕</button></td>`;
  tbody.appendChild(tr);
  const imp = tr.querySelector('.li-imp');
  if (producto?.impuesto === 'EXENTO') imp.value = 'EXENTO';
  if (producto?.impuesto === 'NO_SUJETO') imp.value = 'NO_SUJETO';
  // autocompletar desde catálogo al escribir
  tr.querySelector('.li-prod').addEventListener('input', (e) => {
    const nombre = e.target.value.trim();
    const p = productosCache.find(x => x.nombre === nombre);
    if (p) {
      tr.querySelector('.li-desc').value = p.descripcion || p.nombre;
      tr.querySelector('.li-price').value = p.precio;
      tr.querySelector('.li-imp').value = p.impuesto === 'EXENTO' ? 'EXENTO' : p.impuesto === 'NO_SUJETO' ? 'NO_SUJETO' : 'IVA13';
    }
    recalcular();
  });
  ['li-qty', 'li-price', 'li-imp'].forEach(cl => tr.querySelector('.' + cl).addEventListener('input', recalcular));
  tr.querySelector('.li-desc').addEventListener('input', recalcular);
  recalcular();
}
function eliminarLinea(btn) { btn.closest('tr').remove(); recalcular(); }

function recalcular() {
  let subtotal = 0, iva = 0;
  document.querySelectorAll('#items-tabla tr:not(:first-child)').forEach(tr => {
    const qty = Number(tr.querySelector('.li-qty').value) || 0;
    const price = Number(tr.querySelector('.li-price').value) || 0;
    const imp = tr.querySelector('.li-imp').value;
    const tot = qty * price;
    tr.querySelector('.line-total').textContent = fmt(tot);
    subtotal += tot;
    if (imp === 'IVA13') iva += tot * 0.13;
  });
  $('#t-subtotal').textContent = fmt(subtotal);
  $('#t-iva').textContent = fmt(iva);
  $('#t-total').textContent = fmt(subtotal + iva);
  return { subtotal, iva, total: subtotal + iva };
}

async function nextNumero(tipo) {
  const { data } = await supabase.from('fac_serie').select('correlativo').eq('tipo', tipo).maybeSingle();
  const actual = (data?.correlativo || 0) + 1;
  await supabase.from('fac_serie').upsert({ tipo, correlativo: actual });
  const anio = new Date().getFullYear();
  return `${tipo}-${anio}-${String(actual).padStart(6, '0')}`;
}

async function guardarFactura() {
  const btn = $('#btn-guardar-factura');
  btn.disabled = true;
  const tipo = $('#n-tipo').value;
  const fecha = $('#n-fecha').value || todayStr();
  const obs = $('#n-obs').value.trim();
  const items = [];
  document.querySelectorAll('#items-tabla tr:not(:first-child)').forEach(tr => {
    const desc = tr.querySelector('.li-desc').value.trim() || tr.querySelector('.li-prod').value.trim();
    if (!desc) return;
    items.push({
      producto: tr.querySelector('.li-prod').value.trim(),
      descripcion: desc,
      cantidad: Number(tr.querySelector('.li-qty').value) || 0,
      precio: Number(tr.querySelector('.li-price').value) || 0,
      impuesto: tr.querySelector('.li-imp').value,
    });
  });
  if (!items.length) { alert('Agrega al menos una línea de detalle'); btn.disabled = false; return; }
  const { subtotal, iva, total } = recalcular();
  const numero = await nextNumero(tipo);

  const row = {
    tipo, numero, fecha_emision: fecha,
    cliente_id: $('#n-cliente-id').value ? Number($('#n-cliente-id').value) : null,
    nit_cliente: $('#n-cliente-nit').value || null,
    nombre_cliente: $('#n-cliente-nombre').value || null,
    email_cliente: null,
    items, subtotal, iva, total,
    estado: tipo === 'PROFORMA' ? 'PROFORMA' : 'EMITIDA',
    observaciones: obs || null,
  };
  const { data, error } = await supabase.from('fac_facturas').insert(row).select().single();
  if (error) { alert('Error al guardar: ' + error.message); btn.disabled = false; return; }
  await audit('CREAR', 'fac_facturas', data.id, { numero: data.numero, total });
  location.hash = `#/factura/${data.id}`;
}

/* ---------- Detalle ---------- */
async function viewDetalle(id) {
  cfg = await loadConfig();
  renderBanner();
  const { data: f, error } = await supabase.from('fac_facturas').select('*').eq('id', id).maybeSingle();
  if (error || !f) { $('#app-main').innerHTML = `<div class="card"><div class="empty">Factura no encontrada. <a href="#/facturas">Volver</a></div></div>`; return; }
  const items = f.items || [];
  $('#app-main').innerHTML = `
    <div class="page-head"><div><h2>Factura <span class="muted">${esc(f.numero)}</span></h2>
      <p>${TIPOS[f.tipo] || f.tipo} · ${esc(f.fecha_emision)} · <span class="badge ${f.estado}">${f.estado}</span></p></div>
      <div class="flex"><a href="#/facturas" class="btn btn-ghost">← Volver</a>
      <button class="btn btn-primary" onclick="imprimirFactura(${f.id})">🖨️ Imprimir / PDF</button>
      ${f.estado !== 'ANULADA' ? `<button class="btn btn-danger" onclick="anularFactura(${f.id})">Anular</button>` : ''}</div></div>
    <div class="card"><div class="detail-grid">
      <div class="detail-block"><h4>Cliente</h4><p>${esc(f.nombre_cliente || 'Consumidor final')}</p>
        ${f.nit_cliente ? `<p class="small muted">NIT: ${esc(f.nit_cliente)}</p>` : ''}
        ${f.email_cliente ? `<p class="small muted">${esc(f.email_cliente)}</p>` : ''}</div>
      <div class="detail-block"><h4>Documento</h4>
        <p>Número: <b>${esc(f.numero)}</b></p>
        ${f.numero_control ? `<p class="small muted">Control: ${esc(f.numero_control)}</p>` : ''}
        ${f.sello_recepcion ? `<p class="small muted">Sello MH: ${esc(f.sello_recepcion)}</p>` : ''}
        ${f.observaciones ? `<p class="small muted">Obs: ${esc(f.observaciones)}</p>` : ''}</div>
    </div></div>
    <div class="card">
      <div class="table-wrap"><table>
        <tr><th>Producto / servicio</th><th>Descripción</th><th class="num">Cant</th><th class="num">Precio</th><th class="num">Total</th></tr>
        ${items.map(i => `<tr><td>${esc(i.producto || '')}</td><td>${esc(i.descripcion)}</td>
          <td class="num">${i.cantidad}</td><td class="num">${fmt(i.precio)}</td><td class="num">${fmt(i.cantidad * i.precio)}</td></tr>`).join('')}
      </table></div>
      <div class="totals">
        <div class="row"><span>Subtotal</span><span>${fmt(f.subtotal)}</span></div>
        <div class="row"><span>IVA (13%)</span><span>${fmt(f.iva)}</span></div>
        <div class="row grand"><span>TOTAL</span><span>${fmt(f.total)}</span></div>
      </div>
      <div class="small muted mt">${totalLetras(f.total)}</div>
    </div>`;
}

async function anularFactura(id) {
  if (!confirm('¿Anular esta factura? Se conserva en el histórico con estado ANULADA (la ley exige conservarla 10 años).')) return;
  const { error } = await supabase.from('fac_facturas').update({ estado: 'ANULADA' }).eq('id', id);
  if (error) { alert(error.message); return; }
  await audit('ANULAR', 'fac_facturas', id, null);
  viewDetalle(id);
}

async function imprimirFactura(id) {
  const { data: f } = await supabase.from('fac_facturas').select('*').eq('id', id).maybeSingle();
  if (!f) return;
  const items = f.items || [];
  const emisor = cfg || {};
  const area = $('#print-area');
  area.innerHTML = `
    <div class="invoice">
      <div class="inv-head">
        <div><h2>${esc(emisor.nombre || 'proDUCKtive')}</h2>
          <div class="small">${esc(emisor.giro_primario || '')}<br>
          ${emisor.nit ? 'NIT: ' + esc(emisor.nit) + '<br>' : ''}${emisor.nrc ? 'NRC: ' + esc(emisor.nrc) + '<br>' : ''}
          ${esc(emisor.direccion || '')}${emisor.telefono ? ' · ' + esc(emisor.telefono) : ''}${emisor.email ? ' · ' + esc(emisor.email) : ''}</div>
        </div>
        <div class="inv-meta">
          <div class="inv-num">${esc(f.numero)}</div>
          <div>${TIPOS[f.tipo] || f.tipo}</div>
          <div>Fecha: ${esc(f.fecha_emision)}</div>
          ${f.numero_control ? `<div>Control: ${esc(f.numero_control)}</div>` : ''}
          ${f.sello_recepcion ? `<div>Sello MH: ${esc(f.sello_recepcion)}</div>` : ''}
        </div>
      </div>
      <div class="inv-cols">
        <div class="block"><h4>Facturar a</h4>${esc(f.nombre_cliente || 'Consumidor final')}<br>
          ${f.nit_cliente ? 'NIT: ' + esc(f.nit_cliente) : ''}</div>
        <div class="block"><h4>Estado</h4>${f.estado}</div>
      </div>
      <table>
        <tr><th>#</th><th>Descripción</th><th class="num">Cant.</th><th class="num">P. Unit.</th><th class="num">Total</th></tr>
        ${items.map((i, idx) => `<tr><td>${idx + 1}</td><td>${esc(i.descripcion)}</td><td class="num">${i.cantidad}</td><td class="num">${fmt(i.precio)}</td><td class="num">${fmt(i.cantidad * i.precio)}</td></tr>`).join('')}
      </table>
      <div class="totals">
        <div class="row"><span>Subtotal</span><span>${fmt(f.subtotal)}</span></div>
        <div class="row"><span>IVA 13%</span><span>${fmt(f.iva)}</span></div>
        <div class="row grand"><span>TOTAL</span><span>${fmt(f.total)}</span></div>
      </div>
      <div class="small">${totalLetras(f.total)}</div>
      ${f.observaciones ? `<div class="small mt">${esc(f.observaciones)}</div>` : ''}
      <div class="inv-footer">
        ${f.tipo === 'PROFORMA' ? '⚠️ Documento PROFORMA sin valor tributario. Se emitirá documento fiscal (DTE) al estar inscrita la empresa.' : `Documento emitido electrónicamente. Verifique su autenticidad en el portal del Ministerio de Hacienda.`}
        <br>Generado por Gestor de Facturación proDUCKtive · ${new Date().toLocaleString()}
      </div>
    </div>`;
  window.print();
}

/* ---------- Clientes ---------- */
async function viewClientes() {
  cfg = await loadConfig();
  renderBanner();
  $('#app-main').innerHTML = `
    <div class="page-head"><div><h2>Registro de clientes</h2><p>Tus clientes quedan guardados para re-facturarles después</p></div>
      <button class="btn btn-pink" onclick="modalCliente()">+ Nuevo cliente</button></div>
    <div class="card">
      <div class="filters">
        <input type="search" id="c-busqueda" placeholder="🔍 Buscar por nombre, NIT, correo..." style="min-width:260px">
        <button class="btn btn-ghost" onclick="cargarClientes()">Buscar</button>
      </div>
      <div id="clientes-tabla"><div class="empty">Cargando...</div></div>
    </div>`;
  $('#c-busqueda').addEventListener('keydown', e => { if (e.key === 'Enter') cargarClientes(); });
  await cargarClientes();
}

async function cargarClientes() {
  const t = $('#c-busqueda').value.trim();
  let q = supabase.from('fac_clientes').select('*').order('nombre').limit(300);
  if (t) q = q.or(`nombre.ilike.%${t}%,nit.ilike.%${t}%,email.ilike.%${t}%`);
  const { data } = await q;
  $('#clientes-tabla').innerHTML = (data || []).length ? `
    <div class="table-wrap"><table>
      <tr><th>Nombre</th><th>NIT</th><th>Correo</th><th>Teléfono</th><th></th></tr>
      ${(data || []).map(c => `<tr>
        <td><b>${esc(c.nombre)}</b></td><td>${esc(c.nit || '—')}</td><td>${esc(c.email || '—')}</td><td>${esc(c.telefono || '—')}</td>
        <td class="flex" style="justify-content:flex-end">
          <button class="btn btn-ghost btn-small" onclick="verFacturasCliente(${c.id})">Facturas</button>
          <button class="btn btn-ghost btn-small" onclick="modalCliente(${c.id})">Editar</button>
          <button class="btn btn-danger btn-small" onclick="eliminarCliente(${c.id})">✕</button>
        </td></tr>`).join('')}
    </table></div>` : `<div class="empty">No hay clientes registrados.</div>`;
}

function verFacturasCliente(id) { location.hash = '#/facturas?cliente=' + id; }

async function modalCliente(id) {
  const { data: c } = id ? await supabase.from('fac_clientes').select('*').eq('id', id).maybeSingle() : { data: {} };
  openModal(`
    <h3>${id ? 'Editar cliente' : 'Nuevo cliente'}</h3>
    <label class="field">Nombre / razón social *</label><input id="m-nombre" class="field mb" value="${esc(c.nombre || '')}">
    <label class="field">NIT (opcional)</label><input id="m-nit" class="field mb" value="${esc(c.nit || '')}">
    <label class="field">Correo</label><input id="m-email" class="field mb" type="email" value="${esc(c.email || '')}">
    <label class="field">Teléfono</label><input id="m-tel" class="field mb" value="${esc(c.telefono || '')}">
    <label class="field">Dirección</label><input id="m-dir" class="field mb" value="${esc(c.direccion || '')}">
    <label class="field">Giro / actividad</label><input id="m-giro" class="field mb" value="${esc(c.giro || '')}">
    <label class="field">Notas</label><textarea id="m-notas" class="field" rows="2">${esc(c.notas || '')}</textarea>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" id="btn-guardar-cliente">Guardar</button></div>`, (root) => {
    $('#btn-guardar-cliente').addEventListener('click', async () => {
      const row = {
        nombre: $('#m-nombre').value.trim(), nit: $('#m-nit').value.trim() || null,
        email: $('#m-email').value.trim() || null, telefono: $('#m-tel').value.trim() || null,
        direccion: $('#m-dir').value.trim() || null, giro: $('#m-giro').value.trim() || null,
        notas: $('#m-notas').value.trim() || null,
      };
      if (!row.nombre) return alert('El nombre es obligatorio');
      let err = null;
      if (id) { ({ error: err } = await supabase.from('fac_clientes').update(row).eq('id', id)); }
      else { ({ error: err } = await supabase.from('fac_clientes').insert(row)); }
      if (err) return alert('Error: ' + err.message);
      await audit(id ? 'EDITAR' : 'CREAR', 'fac_clientes', id, { nombre: row.nombre });
      closeModal(); cargarClientes();
    });
  });
}
async function eliminarCliente(id) {
  if (!confirm('¿Eliminar este cliente? (No se eliminan sus facturas)')) return;
  const { error } = await supabase.from('fac_clientes').delete().eq('id', id);
  if (error) return alert(error.message);
  await audit('ELIMINAR', 'fac_clientes', id, null);
  cargarClientes();
}

/* ---------- Recibidas ---------- */
async function viewRecibidas() {
  cfg = await loadConfig();
  renderBanner();
  const { data } = await supabase.from('fac_recibidas').select('*').order('fecha_emision', { ascending: false }).limit(200);
  $('#app-main').innerHTML = `
    <div class="page-head"><div><h2>Facturas recibidas</h2><p>Tus compras (CCF/FSE) — insumo del crédito fiscal</p></div>
      <button class="btn btn-pink" onclick="modalRecibida()">+ Registrar compra</button></div>
    <div class="card">${(data || []).length ? `
      <div class="table-wrap"><table>
        <tr><th>Proveedor</th><th>NIT</th><th>Tipo</th><th>Fecha</th><th>Número</th><th class="num">Subtotal</th><th class="num">IVA</th><th class="num">Total</th><th></th></tr>
        ${(data || []).map(r => `<tr>
          <td><b>${esc(r.proveedor)}</b></td><td>${esc(r.nit_proveedor || '—')}</td><td>${esc(r.tipo)}</td>
          <td>${esc(r.fecha_emision)}</td><td>${esc(r.numero || '—')}</td>
          <td class="num">${fmt(r.subtotal)}</td><td class="num">${fmt(r.iva)}</td><td class="num"><b>${fmt(r.total)}</b></td>
          <td><button class="btn btn-danger btn-small" onclick="eliminarRecibida(${r.id})">✕</button></td></tr>`).join('')}
      </table></div>` : `<div class="empty">Aún no hay compras registradas.</div>`}</div>`;
}

function modalRecibida() {
  openModal(`
    <h3>Registrar compra (CCF)</h3>
    <label class="field">Proveedor *</label><input id="r-proveedor" class="field mb">
    <label class="field">NIT proveedor</label><input id="r-nit" class="field mb">
    <label class="field">Tipo</label><select id="r-tipo" class="field mb"><option>CCF</option><option>FSE</option><option>Otro</option></select>
    <div class="form-grid">
      <div><label class="field">Fecha</label><input id="r-fecha" type="date" class="field" value="${todayStr()}"></div>
      <div><label class="field">Número doc.</label><input id="r-numero" class="field"></div>
    </div>
    <div class="form-grid mt">
      <div><label class="field">Subtotal</label><input id="r-subtotal" type="number" step="0.01" class="field" value="0"></div>
      <div><label class="field">IVA</label><input id="r-iva" type="number" step="0.01" class="field" value="0"></div>
    </div>
    <div class="form-grid mt">
      <div><label class="field">Total</label><input id="r-total" type="number" step="0.01" class="field" value="0"></div>
      <div></div>
    </div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" id="btn-guardar-recibida">Guardar</button></div>`, (root) => {
    $('#btn-guardar-recibida').addEventListener('click', async () => {
      const row = {
        proveedor: $('#r-proveedor').value.trim(), nit_proveedor: $('#r-nit').value.trim() || null,
        tipo: $('#r-tipo').value, fecha_emision: $('#r-fecha').value || todayStr(),
        numero: $('#r-numero').value.trim() || null,
        subtotal: Number($('#r-subtotal').value) || 0, iva: Number($('#r-iva').value) || 0,
        total: Number($('#r-total').value) || 0,
      };
      if (!row.proveedor) return alert('El proveedor es obligatorio');
      const { error } = await supabase.from('fac_recibidas').insert(row);
      if (error) return alert('Error: ' + error.message);
      await audit('CREAR', 'fac_recibidas', null, { proveedor: row.proveedor, total: row.total });
      closeModal(); viewRecibidas();
    });
  });
}
async function eliminarRecibida(id) {
  if (!confirm('¿Eliminar esta compra?')) return;
  await supabase.from('fac_recibidas').delete().eq('id', id);
  await audit('ELIMINAR', 'fac_recibidas', id, null);
  viewRecibidas();
}

/* ---------- Configuración ---------- */
async function viewConfig() {
  cfg = await loadConfig();
  renderBanner();
  $('#app-main').innerHTML = `
    <div class="page-head"><div><h2>Configuración</h2><p>Datos del emisor y modo de facturación</p></div></div>
    <div class="card">
      <div class="card-title">Datos de la empresa emisora</div>
      <div class="form-grid">
        <div><label class="field">Nombre</label><input id="c-nombre" class="field" value="${esc(cfg.nombre || 'proDUCKtive')}"></div>
        <div><label class="field">NIT (DUI)</label><input id="c-nit" class="field" value="${esc(cfg.nit || '')}" placeholder="Ej: 12345678-9"></div>
        <div><label class="field">NRC</label><input id="c-nrc" class="field" value="${esc(cfg.nrc || '')}" placeholder="Se llena al inscribirte"></div>
        <div><label class="field">Teléfono</label><input id="c-tel" class="field" value="${esc(cfg.telefono || '')}"></div>
        <div class="full"><label class="field">Giro principal (CIIU)</label><input id="c-giro" class="field" value="${esc(cfg.giro_primario || '')}"></div>
        <div class="full"><label class="field">Dirección</label><input id="c-dir" class="field" value="${esc(cfg.direccion || '')}"></div>
        <div class="full"><label class="field">Correo</label><input id="c-email" class="field" value="${esc(cfg.email || '')}"></div>
      </div>
      <button class="btn btn-primary mt" id="btn-guardar-config">💾 Guardar configuración</button>
    </div>
    <div class="card">
      <div class="card-title">Estado del sistema</div>
      <table>
        <tr><td>Modo de emisión</td><td><span class="badge ${cfg.nrc ? 'EMITIDA' : 'proforma'}">${cfg.nrc ? 'DTE (NRC registrado)' : 'PROFORMA (sin NRC)'}</span></td></tr>
        <tr><td>Seguridad</td><td>Login con correo · permisos por fila (RLS) · auditoría de acciones · hashes de integridad</td></tr>
        <tr><td>Resguardo</td><td>Backup automático mensual a Google Drive + exportación CSV/JSON manual</td></tr>
        <tr><td>Conservación legal</td><td>Las facturas anuladas se conservan en el histórico (obligatorio 10 años)</td></tr>
      </table>
      <p class="small muted mt">📌 Cuando inscribas tu NRC en Hacienda, ponlo aquí y el sistema cambia automáticamente al modo DTE.</p>
    </div>`;
  $('#btn-guardar-config').addEventListener('click', async () => {
    const row = {
      nombre: $('#c-nombre').value.trim(), nit: $('#c-nit').value.trim(),
      nrc: $('#c-nrc').value.trim(), telefono: $('#c-tel').value.trim(),
      giro_primario: $('#c-giro').value.trim(), direccion: $('#c-dir').value.trim(),
      email: $('#c-email').value.trim(),
    };
    const { error } = await supabase.from('fac_config').update(row).eq('id', 1);
    if (error) return alert('Error: ' + error.message);
    await audit('EDITAR', 'fac_config', 1, { nrc: row.nrc });
    cfg = { ...cfg, ...row };
    alert('✅ Configuración guardada');
    viewConfig();
  });
}

/* ---------- Auditoría ---------- */
async function viewAuditoria() {
  const { data } = await supabase.from('fac_auditoria').select('*').order('created_at', { ascending: false }).limit(200);
  $('#app-main').innerHTML = `
    <div class="page-head"><div><h2>Auditoría</h2><p>Trazabilidad de acciones (seguridad)</p></div></div>
    <div class="card">${(data || []).length ? `
      <div class="table-wrap"><table>
        <tr><th>Fecha</th><th>Acción</th><th>Tabla</th><th>ID</th><th>Usuario</th><th>Detalle</th></tr>
        ${(data || []).map(a => `<tr>
          <td>${esc(new Date(a.created_at).toLocaleString('es-SV'))}</td>
          <td><b>${esc(a.accion)}</b></td><td>${esc(a.tabla)}</td><td>${a.id_registro ?? '—'}</td>
          <td>${esc(a.creado_por)}</td><td class="small muted">${esc(JSON.stringify(a.detalle) || '')}</td></tr>`).join('')}
      </table></div>` : `<div class="empty">Sin actividad registrada aún.</div>`}</div>`;
}

/* ---------- Arranque ---------- */
(async function init() {
  const { data: s } = await supabase.auth.getSession();
  session = s.session;
  window.addEventListener('hashchange', router);
  router();
})();
