/* =====================================================
   STOCKPRO — app.js
===================================================== */

let authToken = null;
let categories = [];
let suppliers = [];
let cachedArticles = [];
let cart = []; // { articleId, name, price, quantity, maxStock }

// ---------- API ----------
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const res = await fetch(path, { headers, ...options });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && authToken && path !== '/api/login') {
    handleSessionExpired();
  }
  if (!res.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
}

function handleSessionExpired() {
  authToken = null;
  document.getElementById('appShell').classList.remove('visible');
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('loginError').textContent = 'Votre session a expiré (le serveur a peut-être redémarré). Reconnectez-vous — vos données n\'ont pas été perdues.';
  document.getElementById('loginPassword').value = '';
}

function formatFCFA(n) {
  return `${Math.round(n).toLocaleString('fr-FR')} FCFA`;
}
function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

let toastTimer = null;
function showToast(message, type = 'default') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

/* =====================================================
   CONNEXION
===================================================== */
function showPasswordWarning() {
  const banner = document.getElementById('passwordWarningBanner');
  banner.style.display = 'block';
  banner.innerHTML = `
    <div class="password-warning">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <div>
        <strong>Vous utilisez encore le mot de passe fourni par défaut.</strong>
        <p>N'importe qui le connaissant pourrait accéder à votre stock et vos ventes. Demandez à la personne qui a installé l'application de le changer pour vous.</p>
      </div>
      <button id="dismissPasswordWarning" title="Masquer pour cette fois"><i class="fa-solid fa-xmark"></i></button>
    </div>
  `;
  document.getElementById('dismissPasswordWarning').addEventListener('click', () => {
    banner.style.display = 'none';
  });
}

function initLogin() {
  const btn = document.getElementById('loginBtn');
  const input = document.getElementById('loginPassword');
  const error = document.getElementById('loginError');

  async function attempt() {
    const password = input.value.trim();
    if (!password) return;
    try {
      const data = await api('/api/login', { method: 'POST', body: JSON.stringify({ password }) });
      authToken = data.token;
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('appShell').classList.add('visible');
      if (data.usingDefaultPassword) showPasswordWarning();
      boot();
    } catch (e) {
      error.textContent = e.message || 'Mot de passe incorrect';
    }
  }
  btn.addEventListener('click', attempt);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') attempt(); });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    try { await api('/api/logout', { method: 'POST' }); } catch (e) {}
    authToken = null;
    document.getElementById('appShell').classList.remove('visible');
    document.getElementById('loginScreen').style.display = 'flex';
    input.value = '';
    error.textContent = '';
  });
}

/* =====================================================
   NAVIGATION
===================================================== */
function initNav() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => switchView(item.dataset.view));
  });
  const quickSaleBtn = document.getElementById('quickSaleBtn');
  if (quickSaleBtn) quickSaleBtn.addEventListener('click', () => switchView('pos'));
}
function switchView(view) {
  document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.view === view));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${view}`));
  if (view === 'dashboard') loadDashboard();
  if (view === 'articles') loadArticles();
  if (view === 'pos') loadPOS();
  if (view === 'sales') loadSales();
  if (view === 'suppliers') loadSuppliers();
  if (view === 'movements') loadMovements();
  if (view === 'reports') loadReports();
  if (view === 'backups') loadBackups();
}

/* =====================================================
   DONNÉES PARTAGÉES (catégories, fournisseurs)
===================================================== */
async function loadSharedData() {
  try {
    categories = await api('/api/categories');
    suppliers = await api('/api/suppliers');

    const catSelect = document.getElementById('articleCategoryFilter');
    catSelect.innerHTML = '<option value="">Toutes les catégories</option>' +
      categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    document.getElementById('categoryList').innerHTML =
      categories.map(c => `<option value="${c.name}">`).join('');
    document.getElementById('supplierList').innerHTML =
      suppliers.map(s => `<option value="${s.name}">`).join('');
  } catch (e) { /* silencieux */ }
}

/* =====================================================
   TABLEAU DE BORD
===================================================== */
function setTopbarDate() {
  const el = document.getElementById('topbarDate');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// Anime un nombre de 0 vers sa valeur finale (respecte prefers-reduced-motion)
function animateCountUp(el, target, formatter) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion || target === 0) { el.textContent = formatter(target); return; }
  const duration = 650;
  const start = performance.now();
  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = formatter(target * eased);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function tableSkeleton(cols, rows = 5) {
  return Array.from({ length: rows }).map(() => `
    <tr class="skeleton-row">
      ${Array.from({ length: cols }).map(() => `<td><div class="skeleton-bar"></div></td>`).join('')}
    </tr>
  `).join('');
}

function kpiSkeleton(count) {
  return Array.from({ length: count }).map(() => `
    <div class="kpi-card kpi-skeleton">
      <div class="kpi-icon skeleton-bar" style="background:none;"></div>
      <div class="kpi-body">
        <div class="kpi-label skeleton-bar"></div>
        <div class="kpi-value skeleton-bar"></div>
      </div>
    </div>
  `).join('');
}

async function loadDashboard() {
  setTopbarDate();
  document.getElementById('dashKpis').innerHTML = kpiSkeleton(5);
  try {
    const d = await api('/api/dashboard');
    document.getElementById('dashKpis').innerHTML = `
      <div class="kpi-card${d.lowStockCount > 0 ? ' alert' : ''}">
        <div class="kpi-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">Stock bas</div>
          <div class="kpi-value" data-count="${d.lowStockCount}">0</div>
          <div class="kpi-sub">article(s) à réapprovisionner</div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon"><i class="fa-solid fa-boxes-stacked"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">Articles en stock</div>
          <div class="kpi-value" data-count="${d.totalArticles}">0</div>
          <div class="kpi-sub">${d.totalSuppliers} fournisseur(s)</div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon"><i class="fa-solid fa-coins"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">Valeur du stock</div>
          <div class="kpi-value" style="font-size:18px;" data-count="${d.stockValue}" data-fcfa="1">0 FCFA</div>
          <div class="kpi-sub">au prix d'achat</div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon"><i class="fa-solid fa-cash-register"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">Ventes aujourd'hui</div>
          <div class="kpi-value" style="font-size:18px;" data-count="${d.todaySalesTotal}" data-fcfa="1">0 FCFA</div>
          <div class="kpi-sub">${d.todaySalesCount} vente(s)</div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon"><i class="fa-solid fa-chart-line"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">Ventes ce mois-ci</div>
          <div class="kpi-value" style="font-size:18px;" data-count="${d.monthSalesTotal}" data-fcfa="1">0 FCFA</div>
          <div class="kpi-sub">${d.monthSalesCount} vente(s)</div>
        </div>
      </div>
    `;
    document.querySelectorAll('#dashKpis [data-count]').forEach(el => {
      const target = Number(el.dataset.count);
      const isFcfa = el.dataset.fcfa === '1';
      animateCountUp(el, target, v => isFcfa ? formatFCFA(v) : Math.round(v).toLocaleString('fr-FR'));
    });

    const trend = await api('/api/reports/sales-by-day?days=7');
    renderTrendChart(trend);

    const lowStock = await api('/api/articles?lowStock=true');
    const body = document.getElementById('dashLowStockBody');
    if (lowStock.length === 0) {
      body.innerHTML = `<tr class="empty-row"><td colspan="4"><i class="fa-solid fa-circle-check empty-state-icon"></i><div class="empty-state-title">Aucun article en stock bas</div><div class="empty-state-sub">Tout est bien approvisionné.</div></td></tr>`;
    } else {
      body.innerHTML = lowStock.slice(0, 15).map(a => `
        <tr>
          <td><strong>${a.name}</strong></td>
          <td>${a.categoryName ? `<span class="cat-tag">${a.categoryName}</span>` : '—'}</td>
          <td class="num"><span class="qty-tag qty-low">${a.quantity} ${a.unit}</span></td>
          <td class="num">${a.minStock}</td>
        </tr>
      `).join('');
    }
  } catch (e) { /* silencieux */ }
}

function renderTrendChart(days) {
  const container = document.getElementById('salesTrendChart');
  if (!container) return;
  const width = Math.max(container.clientWidth || 600, 300);
  const height = 160;
  const padding = { top: 10, bottom: 24, left: 4, right: 4 };
  const max = Math.max(...days.map(d => d.total), 1);
  const barGap = 14;
  const barWidth = (width - padding.left - padding.right - barGap * (days.length - 1)) / days.length;

  const bars = days.map((d, i) => {
    const barHeight = d.total > 0 ? Math.max((d.total / max) * (height - padding.top - padding.bottom), 3) : 2;
    const x = padding.left + i * (barWidth + barGap);
    const y = height - padding.bottom - barHeight;
    const label = new Date(d.day).toLocaleDateString('fr-FR', { weekday: 'short' });
    return `
      <g>
        <rect class="trend-bar ${d.total === 0 ? 'empty' : ''}" x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4"></rect>
        ${d.total > 0 ? `<text class="trend-value-label" x="${x + barWidth / 2}" y="${y - 6}" text-anchor="middle">${Math.round(d.total / 1000)}k</text>` : ''}
        <text class="trend-axis-label" x="${x + barWidth / 2}" y="${height - 6}" text-anchor="middle">${label}</text>
      </g>
    `;
  }).join('');

  container.innerHTML = `<svg class="trend-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="width:100%; height:${height}px;">${bars}</svg>`;
}

function renderDonutChart(data) {
  const container = document.getElementById('categoryDonutChart');
  if (!container) return;
  if (!data || data.length === 0) {
    container.innerHTML = `<p style="color:var(--muted); font-size:13.5px;">Pas encore de données de stock.</p>`;
    return;
  }

  const colors = ['#C6540A', '#2F7D4F', '#3E4A52', '#B45309', '#64737C', '#A2440A', '#7B858A', '#1E2224'];
  const total = data.reduce((s, d) => s + d.value, 0);
  const size = 168, radius = 62, stroke = 26;
  const cx = size / 2, cy = size / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const segments = data.map((d, i) => {
    const fraction = d.value / total;
    const dash = fraction * circumference;
    const seg = `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${colors[i % colors.length]}"
      stroke-width="${stroke}" stroke-dasharray="${dash} ${circumference - dash}"
      stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"></circle>`;
    offset += dash;
    return seg;
  }).join('');

  const legend = data.map((d, i) => `
    <div class="donut-legend-row">
      <span class="donut-legend-dot" style="background:${colors[i % colors.length]};"></span>
      <span class="donut-legend-name">${d.name}</span>
      <span class="donut-legend-value">${formatFCFA(d.value)}</span>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="donut-wrap">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${segments}</svg>
      <div class="donut-legend">${legend}</div>
    </div>
  `;
}

/* =====================================================
   ARTICLES
===================================================== */
let articleFilters = { search: '', categoryId: '', lowStock: false };

function initArticlesView() {
  document.getElementById('articleSearch').addEventListener('keyup', debounce(() => {
    articleFilters.search = document.getElementById('articleSearch').value.trim();
    loadArticles();
  }, 250));
  document.getElementById('articleCategoryFilter').addEventListener('change', (e) => {
    articleFilters.categoryId = e.target.value;
    loadArticles();
  });
  document.getElementById('lowStockToggle').addEventListener('click', (e) => {
    articleFilters.lowStock = !articleFilters.lowStock;
    e.currentTarget.classList.toggle('active', articleFilters.lowStock);
    loadArticles();
  });
  document.getElementById('addArticleBtn').addEventListener('click', () => openArticleModal(null));
  document.getElementById('saveArticleBtn').addEventListener('click', saveArticle);
}

function debounce(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

async function loadArticles() {
  const body = document.getElementById('articlesTableBody');
  body.innerHTML = tableSkeleton(8);
  try {
    const params = new URLSearchParams();
    if (articleFilters.search) params.set('search', articleFilters.search);
    if (articleFilters.categoryId) params.set('categoryId', articleFilters.categoryId);
    if (articleFilters.lowStock) params.set('lowStock', 'true');

    cachedArticles = await api(`/api/articles?${params.toString()}`);
    document.getElementById('articlesCount').textContent = `${cachedArticles.length} article(s)`;

    if (cachedArticles.length === 0) {
      body.innerHTML = `<tr class="empty-row"><td colspan="8"><i class="fa-solid fa-magnifying-glass empty-state-icon"></i><div class="empty-state-title">Aucun article ne correspond</div><div class="empty-state-sub">Essaie une autre recherche ou change les filtres.</div></td></tr>`;
      return;
    }

    body.innerHTML = cachedArticles.map(a => `
      <tr>
        <td><strong>${a.name}</strong></td>
        <td>${a.reference ? `<span class="ref-tag">${a.reference}</span>` : '—'}</td>
        <td>${a.categoryName ? `<span class="cat-tag">${a.categoryName}</span>` : '—'}</td>
        <td class="num"><span class="qty-tag ${a.quantity <= a.minStock ? 'qty-low' : 'qty-ok'}">${a.quantity} ${a.unit}</span></td>
        <td class="num">${formatFCFA(a.purchasePrice)}</td>
        <td class="num">${formatFCFA(a.salePrice)}</td>
        <td>${a.supplierName || '—'}</td>
        <td class="row-actions">
          <button class="icon-btn stock" data-stock="${a.id}" title="Mouvement de stock"><i class="fa-solid fa-right-left"></i></button>
          <button class="icon-btn edit" data-edit="${a.id}" title="Modifier"><i class="fa-solid fa-pen"></i></button>
          <button class="icon-btn delete" data-delete="${a.id}" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>
    `).join('');

    body.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openArticleModal(Number(b.dataset.edit))));
    body.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', () => deleteArticle(Number(b.dataset.delete))));
    body.querySelectorAll('[data-stock]').forEach(b => b.addEventListener('click', () => openStockModal(Number(b.dataset.stock))));
  } catch (e) {
    body.innerHTML = `<tr class="empty-row"><td colspan="8">Erreur de chargement.</td></tr>`;
  }
}

let editingArticleId = null;
function openArticleModal(id) {
  editingArticleId = id;
  const a = id ? cachedArticles.find(x => x.id === id) : null;
  document.getElementById('articleModalTitle').textContent = id ? 'Modifier l\'article' : 'Ajouter un article';
  document.getElementById('aName').value = a ? a.name : '';
  document.getElementById('aReference').value = a ? (a.reference || '') : '';
  document.getElementById('aCategory').value = a ? (a.categoryName || '') : '';
  document.getElementById('aSupplier').value = a ? (a.supplierName || '') : '';
  document.getElementById('aUnit').value = a ? a.unit : 'pièce';
  document.getElementById('aQuantity').value = a ? a.quantity : 0;
  document.getElementById('aQuantity').disabled = Boolean(a);
  document.getElementById('aQtyHint').textContent = a ? '(modifiable via "Mouvement de stock")' : '';
  document.getElementById('aPurchasePrice').value = a ? a.purchasePrice : '';
  document.getElementById('aSalePrice').value = a ? a.salePrice : '';
  document.getElementById('aMinStock').value = a ? a.minStock : 0;
  document.getElementById('aDescription').value = a ? (a.description || '') : '';
  document.getElementById('articleFeedback').textContent = '';
  Validators.clearAll(document.querySelectorAll('#articleModal input, #articleModal select'));
  openModal('articleModal');
}

async function saveArticle() {
  const els = {
    name: document.getElementById('aName'),
    purchasePrice: document.getElementById('aPurchasePrice'),
    salePrice: document.getElementById('aSalePrice'),
    quantity: document.getElementById('aQuantity'),
    minStock: document.getElementById('aMinStock')
  };
  Validators.clearAll(Object.values(els));
  const feedback = document.getElementById('articleFeedback');
  feedback.textContent = '';

  let valid = true;
  if (!Validators.isNonEmptyText(els.name.value, { min: 2, max: 150 })) {
    Validators.markInvalid(els.name, 'Nom invalide.'); valid = false;
  }
  if (!Validators.isPositiveNumber(els.purchasePrice.value)) {
    Validators.markInvalid(els.purchasePrice, 'Prix invalide.'); valid = false;
  }
  if (!Validators.isPositiveNumber(els.salePrice.value)) {
    Validators.markInvalid(els.salePrice, 'Prix invalide.'); valid = false;
  }
  if (!editingArticleId && !Validators.isPositiveInt(els.quantity.value)) {
    Validators.markInvalid(els.quantity, 'Quantité invalide.'); valid = false;
  }
  if (els.minStock.value !== '' && !Validators.isPositiveInt(els.minStock.value)) {
    Validators.markInvalid(els.minStock, 'Seuil invalide.'); valid = false;
  }
  if (!valid) return;

  const payload = {
    name: els.name.value.trim(),
    reference: document.getElementById('aReference').value.trim() || null,
    category: document.getElementById('aCategory').value.trim(),
    supplier: document.getElementById('aSupplier').value.trim(),
    unit: document.getElementById('aUnit').value,
    purchasePrice: Number(els.purchasePrice.value),
    salePrice: Number(els.salePrice.value),
    minStock: Number(els.minStock.value) || 0,
    description: document.getElementById('aDescription').value.trim()
  };
  if (!editingArticleId) payload.quantity = Number(els.quantity.value) || 0;

  try {
    if (editingArticleId) {
      await api(`/api/articles/${editingArticleId}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Article modifié.', 'success');
    } else {
      await api('/api/articles', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Article ajouté.', 'success');
    }
    closeModal('articleModal');
    loadArticles();
    loadSharedData();
  } catch (e) {
    feedback.textContent = e.message || 'Une erreur est survenue.';
    feedback.className = 'form-feedback error';
  }
}

async function deleteArticle(id) {
  const a = cachedArticles.find(x => x.id === id);
  if (!confirm(`Supprimer définitivement "${a ? a.name : 'cet article'}" ?`)) return;
  try {
    await api(`/api/articles/${id}`, { method: 'DELETE' });
    showToast('Article supprimé.', 'success');
    loadArticles();
  } catch (e) {
    showToast(e.message || 'Suppression impossible.', 'error');
  }
}

/* ---- Mouvement de stock manuel ---- */
let stockModalArticleId = null;
function openStockModal(id) {
  stockModalArticleId = id;
  const a = cachedArticles.find(x => x.id === id);
  document.getElementById('stockModalTitle').textContent = `Mouvement de stock — ${a ? a.name : ''}`;
  document.getElementById('sType').value = 'in';
  document.getElementById('sQuantity').value = '';
  document.getElementById('sReason').value = 'achat';
  document.getElementById('sNote').value = '';
  document.getElementById('stockFeedback').textContent = '';
  updateStockLabel();
  openModal('stockModal');
}

function updateStockLabel() {
  const type = document.getElementById('sType').value;
  const label = document.getElementById('sQuantityLabel');
  if (type === 'adjustment') label.textContent = 'Nouvelle quantité exacte en stock';
  else label.textContent = 'Quantité';
}

async function saveStockMovement() {
  const quantityEl = document.getElementById('sQuantity');
  Validators.clearInvalid(quantityEl);
  const feedback = document.getElementById('stockFeedback');
  feedback.textContent = '';

  if (!Validators.isPositiveInt(quantityEl.value)) {
    Validators.markInvalid(quantityEl, 'Quantité invalide.');
    return;
  }

  const type = document.getElementById('sType').value;
  const reason = document.getElementById('sReason').value;
  const note = document.getElementById('sNote').value.trim();

  try {
    await api(`/api/articles/${stockModalArticleId}/stock`, {
      method: 'POST',
      body: JSON.stringify({ type, quantity: Number(quantityEl.value), reason, note })
    });
    showToast('Stock mis à jour.', 'success');
    closeModal('stockModal');
    loadArticles();
    loadDashboard();
  } catch (e) {
    feedback.textContent = e.message || 'Une erreur est survenue.';
    feedback.className = 'form-feedback error';
  }
}

/* =====================================================
   POINT DE VENTE
===================================================== */
let posSearchTerm = '';

function initPOS() {
  document.getElementById('posSearch').addEventListener('keyup', debounce((e) => {
    posSearchTerm = e.target.value.trim().toLowerCase();
    renderPOSResults();
  }, 200));
  document.getElementById('checkoutBtn').addEventListener('click', checkout);
}

async function loadPOS() {
  try {
    cachedArticles = await api('/api/articles');
    renderPOSResults();
  } catch (e) { /* silencieux */ }
}

function renderPOSResults() {
  const container = document.getElementById('posResults');
  const list = posSearchTerm
    ? cachedArticles.filter(a => `${a.name} ${a.reference || ''}`.toLowerCase().includes(posSearchTerm))
    : cachedArticles;

  if (list.length === 0) {
    container.innerHTML = `<div class="pos-empty-cart">Aucun article trouvé.</div>`;
    return;
  }

  container.innerHTML = list.slice(0, 60).map(a => `
    <div class="pos-item-card ${a.quantity <= 0 ? 'disabled' : ''}" data-add="${a.id}">
      <div class="pos-item-name">${a.name}</div>
      <div class="pos-item-price">${formatFCFA(a.salePrice)}</div>
      <div class="pos-item-stock">Stock : ${a.quantity} ${a.unit}</div>
    </div>
  `).join('');

  container.querySelectorAll('[data-add]').forEach(card => {
    card.addEventListener('click', () => addToCart(Number(card.dataset.add)));
  });
}

function addToCart(articleId) {
  const article = cachedArticles.find(a => a.id === articleId);
  if (!article || article.quantity <= 0) return;

  const existing = cart.find(c => c.articleId === articleId);
  if (existing) {
    if (existing.quantity < article.quantity) existing.quantity++;
    else showToast('Stock disponible atteint.', 'error');
  } else {
    cart.push({ articleId, name: article.name, price: article.salePrice, quantity: 1, maxStock: article.quantity });
  }
  renderCart();
}

function renderCart() {
  const list = document.getElementById('cartList');
  if (cart.length === 0) {
    list.innerHTML = `<div class="pos-empty-cart">Panier vide — cliquez sur un article pour l'ajouter.</div>`;
  } else {
    list.innerHTML = cart.map((c, i) => `
      <div class="cart-row">
        <div class="cart-row-name">${c.name}</div>
        <div class="cart-row-qty">
          <button class="qty-btn" data-dec="${i}">−</button>
          <input type="text" value="${c.quantity}" data-qty="${i}" readonly>
          <button class="qty-btn" data-inc="${i}">+</button>
        </div>
        <div class="cart-row-subtotal">${formatFCFA(c.price * c.quantity)}</div>
        <button class="cart-row-remove" data-remove="${i}"><i class="fa-solid fa-xmark"></i></button>
      </div>
    `).join('');

    list.querySelectorAll('[data-inc]').forEach(b => b.addEventListener('click', () => changeCartQty(Number(b.dataset.inc), 1)));
    list.querySelectorAll('[data-dec]').forEach(b => b.addEventListener('click', () => changeCartQty(Number(b.dataset.dec), -1)));
    list.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => { cart.splice(Number(b.dataset.remove), 1); renderCart(); }));
  }

  const total = cart.reduce((sum, c) => sum + c.price * c.quantity, 0);
  document.getElementById('cartTotal').textContent = formatFCFA(total);
}

function changeCartQty(index, delta) {
  const item = cart[index];
  const newQty = item.quantity + delta;
  if (newQty < 1) { cart.splice(index, 1); renderCart(); return; }
  if (newQty > item.maxStock) { showToast('Stock disponible atteint.', 'error'); return; }
  item.quantity = newQty;
  renderCart();
}

async function checkout() {
  const feedback = document.getElementById('posFeedback');
  feedback.textContent = '';
  if (cart.length === 0) {
    feedback.textContent = 'Le panier est vide.';
    feedback.className = 'form-feedback error';
    return;
  }

  const clientName = document.getElementById('posClientName').value.trim();
  const paymentMethod = document.getElementById('posPaymentMethod').value;

  try {
    const sale = await api('/api/sales', {
      method: 'POST',
      body: JSON.stringify({
        items: cart.map(c => ({ articleId: c.articleId, quantity: c.quantity })),
        clientName, paymentMethod
      })
    });
    showToast(`Vente encaissée : ${formatFCFA(sale.total)}`, 'success');
    if (document.getElementById('posPrintReceipt').checked) printReceipt(sale);
    cart = [];
    renderCart();
    document.getElementById('posClientName').value = '';
    loadPOS();
  } catch (e) {
    feedback.textContent = e.message || 'Une erreur est survenue.';
    feedback.className = 'form-feedback error';
  }
}

/* =====================================================
   VENTES (historique)
===================================================== */
async function loadSales() {
  const body = document.getElementById('salesTableBody');
  body.innerHTML = tableSkeleton(6);
  try {
    const sales = await api('/api/sales');
    document.getElementById('salesCount').textContent = `${sales.length} vente(s)`;
    if (sales.length === 0) {
      body.innerHTML = `<tr class="empty-row"><td colspan="6"><i class="fa-solid fa-receipt empty-state-icon"></i><div class="empty-state-title">Aucune vente enregistrée</div><div class="empty-state-sub">Vos ventes apparaîtront ici.</div></td></tr>`;
      return;
    }
    body.innerHTML = sales.map(s => `
      <tr${s.status === 'cancelled' ? ' style="opacity:.55;"' : ''}>
        <td class="ref-tag">#${s.id.toString().slice(-6)}</td>
        <td>${formatDate(s.createdAt)}</td>
        <td>${s.clientName || 'Client de passage'}</td>
        <td>${s.paymentMethod}</td>
        <td class="num">${formatFCFA(s.total)}</td>
        <td>${s.status === 'cancelled'
              ? '<span class="qty-tag qty-low">Annulée</span>'
              : '<span class="qty-tag qty-ok">Validée</span>'}</td>
        <td><button class="btn btn-secondary btn-sm" data-view-sale="${s.id}">Détail</button></td>
      </tr>
    `).join('');
    body.querySelectorAll('[data-view-sale]').forEach(b => b.addEventListener('click', () => viewSale(Number(b.dataset.viewSale))));
  } catch (e) {
    body.innerHTML = `<tr class="empty-row"><td colspan="6">Erreur de chargement.</td></tr>`;
  }
}

async function viewSale(id) {
  try {
    const sale = await api(`/api/sales/${id}`);
    document.getElementById('saleDetailContent').innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
        <p style="color:var(--muted); font-size:13px; margin:0;">${formatDate(sale.createdAt)} — ${sale.clientName || 'Client de passage'} — ${sale.paymentMethod}</p>
        ${sale.status === 'cancelled' ? '<span class="qty-tag qty-low">Vente annulée</span>' : '<span class="qty-tag qty-ok">Vente validée</span>'}
      </div>
      <table class="data-table" style="margin-top:12px;">
        <thead><tr><th>Article</th><th class="num">Qté</th><th class="num">P.U.</th><th class="num">Sous-total</th></tr></thead>
        <tbody>
          ${sale.items.map(it => `
            <tr>
              <td>${it.articleName}</td>
              <td class="num">${it.quantity}</td>
              <td class="num">${formatFCFA(it.unitPrice)}</td>
              <td class="num">${formatFCFA(it.subtotal)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="cart-total-row">
        <span class="cart-total-label">Total</span>
        <span class="cart-total-value">${formatFCFA(sale.total)}</span>
      </div>
      <div style="display:flex; gap:10px; margin-top:18px;">
        <button class="btn btn-secondary" id="printSaleBtn" style="flex:1;"><i class="fa-solid fa-print"></i> Imprimer le reçu</button>
        ${sale.status !== 'cancelled' ? `<button class="btn btn-danger" id="cancelSaleBtn" style="flex:1;"><i class="fa-solid fa-rotate-left"></i> Annuler cette vente</button>` : ''}
      </div>
    `;
    document.getElementById('printSaleBtn').addEventListener('click', () => printReceipt(sale));
    const cancelBtn = document.getElementById('cancelSaleBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => cancelSale(sale.id));
    openModal('saleDetailModal');
  } catch (e) {
    showToast('Impossible de charger cette vente.', 'error');
  }
}

async function cancelSale(id) {
  if (!confirm('Annuler cette vente ? Les articles vendus seront automatiquement remis en stock. Cette action reste visible dans l\'historique.')) return;
  try {
    await api(`/api/sales/${id}/cancel`, { method: 'POST' });
    showToast('Vente annulée, stock remis à jour.', 'success');
    closeModal('saleDetailModal');
    loadSales();
  } catch (e) {
    showToast(e.message || 'Impossible d\'annuler cette vente.', 'error');
  }
}

/* ---- Impression du reçu ---- */
function printReceipt(sale) {
  const win = window.open('', '_blank', 'width=380,height=600');
  const rows = sale.items.map(it => `
    <tr>
      <td>${it.articleName}</td>
      <td style="text-align:center;">${it.quantity}</td>
      <td style="text-align:right;">${formatFCFA(it.subtotal)}</td>
    </tr>
  `).join('');
  win.document.write(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <title>Reçu — vente #${sale.id.toString().slice(-6)}</title>
      <style>
        body{ font-family: 'Courier New', monospace; font-size: 13px; padding: 16px; color: #111; }
        h1{ font-size: 16px; text-align: center; margin: 0 0 4px; }
        .sub{ text-align: center; color: #555; font-size: 11.5px; margin-bottom: 14px; }
        table{ width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td{ padding: 4px 2px; border-bottom: 1px dashed #999; font-size: 12.5px; }
        th{ text-align: left; border-bottom: 1px solid #333; }
        .total-row td{ font-weight: bold; font-size: 14px; border-top: 1px solid #333; border-bottom: none; padding-top: 8px; }
        .footer{ text-align: center; margin-top: 18px; font-size: 11.5px; color: #555; }
        ${sale.status === 'cancelled' ? '.cancelled-stamp{ text-align:center; color:#b91c1c; font-weight:bold; border:2px solid #b91c1c; padding:4px; margin-bottom:10px; }' : ''}
      </style>
    </head>
    <body>
      <h1>Reçu de vente</h1>
      <p class="sub">Vente #${sale.id.toString().slice(-6)} — ${formatDate(sale.createdAt)}</p>
      ${sale.status === 'cancelled' ? '<p class="cancelled-stamp">VENTE ANNULÉE</p>' : ''}
      <p class="sub">Client : ${sale.clientName || 'Client de passage'} — Paiement : ${sale.paymentMethod}</p>
      <table>
        <thead><tr><th>Article</th><th style="text-align:center;">Qté</th><th style="text-align:right;">Total</th></tr></thead>
        <tbody>
          ${rows}
          <tr class="total-row"><td colspan="2">TOTAL</td><td style="text-align:right;">${formatFCFA(sale.total)}</td></tr>
        </tbody>
      </table>
      <p class="footer">Merci de votre confiance</p>
      <script>window.onload = () => window.print();</script>
    </body>
    </html>
  `);
  win.document.close();
}

/* =====================================================
   FOURNISSEURS
===================================================== */
function initSuppliers() {
  document.getElementById('addSupplierBtn').addEventListener('click', () => openSupplierModal(null));
  document.getElementById('saveSupplierBtn').addEventListener('click', saveSupplier);
}

async function loadSuppliers() {
  const body = document.getElementById('suppliersTableBody');
  body.innerHTML = tableSkeleton(5);
  try {
    suppliers = await api('/api/suppliers');
    document.getElementById('suppliersCount').textContent = `${suppliers.length} fournisseur(s)`;
    if (suppliers.length === 0) {
      body.innerHTML = `<tr class="empty-row"><td colspan="5"><i class="fa-solid fa-truck-field empty-state-icon"></i><div class="empty-state-title">Aucun fournisseur enregistré</div><div class="empty-state-sub">Ajoutez votre premier fournisseur.</div></td></tr>`;
      return;
    }
    body.innerHTML = suppliers.map(s => `
      <tr>
        <td><strong>${s.name}</strong></td>
        <td>${s.phone || '—'}</td>
        <td>${s.email || '—'}</td>
        <td class="num">${s.articleCount}</td>
        <td class="row-actions">
          <button class="icon-btn edit" data-edit-sup="${s.id}" title="Modifier"><i class="fa-solid fa-pen"></i></button>
          <button class="icon-btn delete" data-delete-sup="${s.id}" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>
    `).join('');
    body.querySelectorAll('[data-edit-sup]').forEach(b => b.addEventListener('click', () => openSupplierModal(Number(b.dataset.editSup))));
    body.querySelectorAll('[data-delete-sup]').forEach(b => b.addEventListener('click', () => deleteSupplier(Number(b.dataset.deleteSup))));
  } catch (e) {
    body.innerHTML = `<tr class="empty-row"><td colspan="5">Erreur de chargement.</td></tr>`;
  }
}

let editingSupplierId = null;
function openSupplierModal(id) {
  editingSupplierId = id;
  const s = id ? suppliers.find(x => x.id === id) : null;
  document.getElementById('supplierModalTitle').textContent = id ? 'Modifier le fournisseur' : 'Ajouter un fournisseur';
  document.getElementById('supName').value = s ? s.name : '';
  document.getElementById('supPhone').value = s ? (s.phone || '') : '';
  document.getElementById('supEmail').value = s ? (s.email || '') : '';
  document.getElementById('supAddress').value = s ? (s.address || '') : '';
  document.getElementById('supNotes').value = s ? (s.notes || '') : '';
  document.getElementById('supplierFeedback').textContent = '';
  Validators.clearAll(document.querySelectorAll('#supplierModal input'));
  openModal('supplierModal');
}

async function saveSupplier() {
  const nameEl = document.getElementById('supName');
  const phoneEl = document.getElementById('supPhone');
  const emailEl = document.getElementById('supEmail');
  Validators.clearAll([nameEl, phoneEl, emailEl]);
  const feedback = document.getElementById('supplierFeedback');
  feedback.textContent = '';

  let valid = true;
  if (!Validators.isNonEmptyText(nameEl.value, { min: 2, max: 100 })) {
    Validators.markInvalid(nameEl, 'Nom invalide.'); valid = false;
  }
  if (!Validators.isValidPhone(phoneEl.value)) {
    Validators.markInvalid(phoneEl, 'Téléphone invalide (8 à 15 chiffres).'); valid = false;
  }
  if (!Validators.isValidEmail(emailEl.value)) {
    Validators.markInvalid(emailEl, 'Email invalide.'); valid = false;
  }
  if (!valid) return;

  const payload = {
    name: nameEl.value.trim(),
    phone: phoneEl.value.trim(),
    email: emailEl.value.trim(),
    address: document.getElementById('supAddress').value.trim(),
    notes: document.getElementById('supNotes').value.trim()
  };

  try {
    if (editingSupplierId) {
      await api(`/api/suppliers/${editingSupplierId}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Fournisseur modifié.', 'success');
    } else {
      await api('/api/suppliers', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Fournisseur ajouté.', 'success');
    }
    closeModal('supplierModal');
    loadSuppliers();
  } catch (e) {
    feedback.textContent = e.message || 'Une erreur est survenue.';
    feedback.className = 'form-feedback error';
  }
}

async function deleteSupplier(id) {
  if (!confirm('Supprimer ce fournisseur ? Les articles liés resteront mais sans fournisseur associé.')) return;
  try {
    await api(`/api/suppliers/${id}`, { method: 'DELETE' });
    showToast('Fournisseur supprimé.', 'success');
    loadSuppliers();
  } catch (e) {
    showToast(e.message || 'Suppression impossible.', 'error');
  }
}

/* =====================================================
   MOUVEMENTS
===================================================== */
function initMovements() {
  document.getElementById('movementTypeFilter').addEventListener('change', loadMovements);
}

async function loadMovements() {
  const body = document.getElementById('movementsTableBody');
  body.innerHTML = tableSkeleton(6);
  try {
    const type = document.getElementById('movementTypeFilter').value;
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    const movements = await api(`/api/movements?${params.toString()}`);

    if (movements.length === 0) {
      body.innerHTML = `<tr class="empty-row"><td colspan="6"><i class="fa-solid fa-right-left empty-state-icon"></i><div class="empty-state-title">Aucun mouvement enregistré</div><div class="empty-state-sub">Les entrées et sorties de stock apparaîtront ici.</div></td></tr>`;
      return;
    }
    body.innerHTML = movements.map(m => `
      <tr>
        <td>${formatDate(m.createdAt)}</td>
        <td><strong>${m.articleName}</strong>${m.articleReference ? ` <span class="ref-tag">${m.articleReference}</span>` : ''}</td>
        <td>${m.type === 'in' ? '<span class="qty-tag qty-ok">Entrée</span>' : '<span class="qty-tag qty-low">Sortie</span>'}</td>
        <td class="num">${m.quantity}</td>
        <td>${m.reason}</td>
        <td style="color:var(--muted);">${m.note || '—'}</td>
      </tr>
    `).join('');
  } catch (e) {
    body.innerHTML = `<tr class="empty-row"><td colspan="6">Erreur de chargement.</td></tr>`;
  }
}

/* =====================================================
   RAPPORTS
===================================================== */
function initReports() {
  document.getElementById('reportPeriod').addEventListener('change', loadReports);
}

async function loadReports() {
  document.getElementById('reportKpis').innerHTML = kpiSkeleton(4);
  try {
    const d = await api('/api/dashboard');
    document.getElementById('reportKpis').innerHTML = `
      <div class="kpi-card">
        <div class="kpi-icon"><i class="fa-solid fa-warehouse"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">Valeur du stock (achat)</div>
          <div class="kpi-value" style="font-size:18px;">${formatFCFA(d.stockValue)}</div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon"><i class="fa-solid fa-tags"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">Valeur potentielle (vente)</div>
          <div class="kpi-value" style="font-size:18px;">${formatFCFA(d.potentialValue)}</div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon"><i class="fa-solid fa-arrow-trend-up"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">Marge potentielle</div>
          <div class="kpi-value" style="font-size:18px;">${formatFCFA(d.potentialValue - d.stockValue)}</div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon"><i class="fa-solid fa-chart-line"></i></div>
        <div class="kpi-body">
          <div class="kpi-label">Ventes ce mois-ci</div>
          <div class="kpi-value" style="font-size:18px;">${formatFCFA(d.monthSalesTotal)}</div>
          <div class="kpi-sub">${d.monthSalesCount} vente(s)</div>
        </div>
      </div>
    `;

    const period = document.getElementById('reportPeriod').value;
    const params = new URLSearchParams({ limit: 10 });
    if (period) params.set('period', period);
    const top = await api(`/api/reports/top-articles?${params.toString()}`);

    const chart = document.getElementById('topArticlesChart');
    if (top.length === 0) {
      chart.innerHTML = `<p style="color:var(--muted); font-size:13.5px;">Pas encore assez de ventes pour cette période.</p>`;
    } else {
      const max = Math.max(...top.map(t => t.totalQty));
      chart.innerHTML = top.map((t, i) => `
        <div class="report-bar-row">
          <div class="report-bar-label" title="${t.articleName}">${i + 1}. ${t.articleName}</div>
          <div class="report-bar-track">
            <div class="report-bar-fill" style="width:${Math.max(4, (t.totalQty / max) * 100)}%;"></div>
          </div>
          <div class="report-bar-value">${t.totalQty} vendus</div>
        </div>
      `).join('');
    }

    const categoryValue = await api('/api/reports/category-value');
    renderDonutChart(categoryValue);
  } catch (e) { /* silencieux */ }
}


/* =====================================================
   IMPORT CSV
===================================================== */
function initImport() {
  document.getElementById('openImportBtn').addEventListener('click', () => {
    document.getElementById('importTextarea').value = '';
    document.getElementById('importResults').innerHTML = '';
    openModal('importModal');
  });

  const dropzone = document.getElementById('importDropzone');
  const fileInput = document.getElementById('importFileInput');
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) readCSVFile(fileInput.files[0]);
  });
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag');
    if (e.dataTransfer.files[0]) readCSVFile(e.dataTransfer.files[0]);
  });

  document.getElementById('runImportBtn').addEventListener('click', runImport);
}

function readCSVFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => { document.getElementById('importTextarea').value = e.target.result; };
  reader.readAsText(file);
}

async function runImport() {
  const csv = document.getElementById('importTextarea').value.trim();
  const resultsEl = document.getElementById('importResults');
  if (!csv) {
    resultsEl.innerHTML = `<p class="form-feedback error">Aucun contenu CSV à importer.</p>`;
    return;
  }
  resultsEl.innerHTML = `<p style="color:var(--muted); font-size:13px;">Import en cours…</p>`;
  try {
    const result = await api('/api/articles/import', { method: 'POST', body: JSON.stringify({ csv }) });
    resultsEl.innerHTML = `
      <div class="import-results">
        <strong>${result.created}</strong> article(s) créé(s), <strong>${result.updated}</strong> mis à jour.
        ${result.errors.length > 0 ? `
          <p style="margin-top:10px; color:var(--danger); font-weight:600;">${result.errors.length} ligne(s) ignorée(s) :</p>
          <ul>${result.errors.slice(0, 20).map(e => `<li>${e}</li>`).join('')}</ul>
        ` : ''}
      </div>
    `;
    showToast('Import terminé.', 'success');
    loadArticles();
    loadSharedData();
  } catch (e) {
    resultsEl.innerHTML = `<p class="form-feedback error">${e.message || 'Erreur pendant l\'import.'}</p>`;
  }
}

/* =====================================================
   MODALES (génériques)
===================================================== */
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function initModals() {
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(overlay.id); });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.open').forEach(m => closeModal(m.id));
  });
  document.getElementById('saveStockBtn').addEventListener('click', saveStockMovement);
  document.getElementById('sType').addEventListener('change', updateStockLabel);
}

/* =====================================================
   SAUVEGARDES
===================================================== */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

async function loadBackups() {
  const body = document.getElementById('backupsTableBody');
  body.innerHTML = `<tr class="empty-row"><td colspan="4">Chargement…</td></tr>`;
  try {
    const data = await api('/api/backups');
    if (data.backups.length === 0) {
      body.innerHTML = `<tr class="empty-row"><td colspan="4"><i class="fa-solid fa-database empty-state-icon"></i><div class="empty-state-title">Pas encore de sauvegarde</div><div class="empty-state-sub">La première sera faite automatiquement très bientôt.</div></td></tr>`;
      return;
    }
    body.innerHTML = data.backups.map((b, i) => `
      <tr>
        <td>${i === 0 ? '<strong>Sauvegarde la plus récente</strong>' : 'Sauvegarde'}</td>
        <td class="num">${formatBytes(b.size)}</td>
        <td>${formatDate(b.createdAt)}</td>
        <td>
          <a class="btn btn-secondary" href="/api/backups/${encodeURIComponent(b.name)}?token=${encodeURIComponent(authToken)}" title="Télécharger cette sauvegarde">
            <i class="fa-solid fa-download"></i> Télécharger
          </a>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    body.innerHTML = `<tr class="empty-row"><td colspan="4">Erreur de chargement.</td></tr>`;
  }
}

async function runBackupNow() {
  const btn = document.getElementById('runBackupBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sauvegarde en cours…';
  try {
    await api('/api/backups', { method: 'POST' });
    showToast('Sauvegarde effectuée avec succès.', 'success');
    await loadBackups();
  } catch (e) {
    showToast(e.message || 'La sauvegarde a échoué.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-database"></i> Faire une sauvegarde maintenant';
  }
}

function initBackups() {
  document.getElementById('runBackupBtn').addEventListener('click', runBackupNow);
}

/* =====================================================
   INITIALISATION
===================================================== */
async function boot() {
  await loadSharedData();
  loadDashboard();
}

document.addEventListener('DOMContentLoaded', () => {
  initLogin();
  initNav();
  initModals();
  initArticlesView();
  initPOS();
  initSuppliers();
  initMovements();
  initReports();
  initImport();
  initBackups();
});
