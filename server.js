// StockPro — backend
// Serveur HTTP en Node.js pur. Application privée (une seule personne) :
// tout est protégé par mot de passe, sauf la page de connexion elle-même.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./db.js');
const backup = require('./backup.js');

const PORT = process.env.PORT || 3001;
const PUBLIC_DIR = path.join(__dirname, 'public');
const APP_PASSWORD = process.env.APP_PASSWORD || 'quincaillerie123';
const sessions = new Set();

function isAuthed(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return Boolean(token) && sessions.has(token);
}

// ---------- Validation ----------
const HAS_LETTER_OR_DIGIT = /[A-Za-zÀ-ÖØ-öø-ÿ0-9]/;
function isNonEmpty(v, { min = 1, max = 200 } = {}) {
  const s = (v || '').toString().trim();
  return s.length >= min && s.length <= max && HAS_LETTER_OR_DIGIT.test(s);
}
function isPositiveNumber(v) {
  const n = Number(v);
  return !Number.isNaN(n) && n >= 0;
}
function isPositiveInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0;
}

// ---------- Utilitaires HTTP ----------
function sendJSON(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 5e6) req.destroy(); // 5 Mo max (import CSV inclus)
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function serveStatic(req, res) {
  let urlPath = req.url === '/' ? '/index.html' : req.url;
  urlPath = urlPath.split('?')[0];
  const filePath = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(urlPath)));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Page introuvable');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

// Simple parseur CSV (gère les champs entre guillemets et les virgules/points-virgules)
function parseCSV(text) {
  const delimiter = text.includes(';') && !text.includes(',') ? ';' : ',';
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length === 0) return [];

  function parseLine(line) {
    const cells = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === delimiter && !inQuotes) { cells.push(cur); cur = ''; continue; }
      cur += ch;
    }
    cells.push(cur);
    return cells.map(c => c.trim());
  }

  const header = parseLine(lines[0]).map(h => h.toLowerCase());
  return lines.slice(1).map(line => {
    const cells = parseLine(line);
    const row = {};
    header.forEach((h, i) => { row[h] = cells[i] !== undefined ? cells[i] : ''; });
    return {
      reference: row.reference || row.ref || '',
      name: row.name || row.nom || '',
      category: row.category || row.categorie || row['catégorie'] || '',
      unit: row.unit || row.unite || row['unité'] || 'pièce',
      purchasePrice: row.purchaseprice || row['prix achat'] || row.prixachat || 0,
      salePrice: row.saleprice || row['prix vente'] || row.prixvente || 0,
      quantity: row.quantity || row.quantite || row['quantité'] || 0,
      minStock: row.minstock || row['stock min'] || row.stockmin || 0,
      supplier: row.supplier || row.fournisseur || '',
      description: row.description || ''
    };
  }).map(row => ({
    ...row,
    purchasePrice: Number(String(row.purchasePrice).replace(',', '.')) || 0,
    salePrice: Number(String(row.salePrice).replace(',', '.')) || 0,
    quantity: parseInt(row.quantity, 10) || 0,
    minStock: parseInt(row.minStock, 10) || 0
  }));
}

const server = http.createServer(async (req, res) => {
  let parsedUrl;
  try { parsedUrl = new URL(req.url, `http://${req.headers.host}`); }
  catch (e) { return sendJSON(res, 400, { error: 'URL invalide' }); }
  const { pathname, searchParams } = parsedUrl;

  try {
    // ===== AUTHENTIFICATION =====
    if (pathname === '/api/login' && req.method === 'POST') {
      const body = await parseBody(req).catch(() => ({}));
      if (body.password !== APP_PASSWORD) return sendJSON(res, 401, { error: 'Mot de passe incorrect' });
      const token = crypto.randomBytes(24).toString('hex');
      sessions.add(token);
      return sendJSON(res, 200, { token, usingDefaultPassword: APP_PASSWORD === 'quincaillerie123' });
    }
    if (pathname === '/api/logout' && req.method === 'POST') {
      const auth = req.headers['authorization'] || '';
      sessions.delete(auth.startsWith('Bearer ') ? auth.slice(7) : '');
      return sendJSON(res, 200, { success: true });
    }

    // ===== Tout le reste de l'API exige d'être connecté =====
    const isBackupDownload = /^\/api\/backups\/[^/]+$/.test(pathname) && req.method === 'GET';
    if (pathname.startsWith('/api/') && pathname !== '/api/login' && !isBackupDownload && !isAuthed(req)) {
      return sendJSON(res, 401, { error: 'Non autorisé' });
    }

    // ===== SAUVEGARDES =====
    if (pathname === '/api/backups' && req.method === 'GET') {
      return sendJSON(res, 200, { backups: backup.listBackups() });
    }
    if (pathname === '/api/backups' && req.method === 'POST') {
      const filename = backup.runBackup();
      if (!filename) return sendJSON(res, 500, { error: 'La sauvegarde a échoué' });
      return sendJSON(res, 201, { filename });
    }
    if (isBackupDownload) {
      // Un lien <a> classique ne peut pas envoyer d'en-tête Authorization,
      // donc ce téléchargement accepte aussi le token en paramètre d'URL.
      const queryToken = searchParams.get('token');
      const authorized = isAuthed(req) || (queryToken && sessions.has(queryToken));
      if (!authorized) return sendJSON(res, 401, { error: 'Non autorisé' });
      const filename = pathname.slice('/api/backups/'.length);
      const filePath = backup.getBackupPath(decodeURIComponent(filename));
      if (!filePath) return sendJSON(res, 404, { error: 'Sauvegarde introuvable' });
      const content = fs.readFileSync(filePath);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${path.basename(filePath)}"`
      });
      return res.end(content);
    }

    // ===== TABLEAU DE BORD =====
    if (pathname === '/api/dashboard' && req.method === 'GET') {
      return sendJSON(res, 200, store.getDashboard());
    }
    if (pathname === '/api/reports/top-articles' && req.method === 'GET') {
      const limit = Number(searchParams.get('limit')) || 10;
      const period = searchParams.get('period') || '';
      let from = '';
      if (period === 'month') { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); from = d.toISOString(); }
      if (period === 'week') { const d = new Date(); d.setDate(d.getDate() - 7); from = d.toISOString(); }
      return sendJSON(res, 200, store.getTopArticles({ limit, from }));
    }
    if (pathname === '/api/reports/sales-by-day' && req.method === 'GET') {
      const days = Math.min(Number(searchParams.get('days')) || 7, 90);
      return sendJSON(res, 200, store.getSalesByDay(days));
    }
    if (pathname === '/api/reports/category-value' && req.method === 'GET') {
      return sendJSON(res, 200, store.getCategoryValueBreakdown());
    }

    // ===== CATÉGORIES =====
    if (pathname === '/api/categories' && req.method === 'GET') {
      return sendJSON(res, 200, store.getCategories());
    }
    if (pathname === '/api/categories' && req.method === 'POST') {
      const body = await parseBody(req).catch(() => ({}));
      if (!isNonEmpty(body.name, { min: 2, max: 60 })) return sendJSON(res, 400, { error: 'Nom de catégorie invalide' });
      const id = store.ensureCategory(body.name.trim());
      return sendJSON(res, 201, { id, name: body.name.trim() });
    }
    const categoryMatch = pathname.match(/^\/api\/categories\/(\d+)$/);
    if (categoryMatch && req.method === 'DELETE') {
      const ok = store.deleteCategory(Number(categoryMatch[1]));
      if (!ok) return sendJSON(res, 404, { error: 'Catégorie introuvable' });
      return sendJSON(res, 200, { success: true });
    }

    // ===== FOURNISSEURS =====
    if (pathname === '/api/suppliers' && req.method === 'GET') {
      return sendJSON(res, 200, store.getSuppliers());
    }
    if (pathname === '/api/suppliers' && req.method === 'POST') {
      const body = await parseBody(req).catch(() => ({}));
      if (!isNonEmpty(body.name, { min: 2, max: 100 })) return sendJSON(res, 400, { error: 'Nom de fournisseur invalide' });
      const supplier = store.insertSupplier({
        name: body.name.trim(), phone: body.phone || '', email: body.email || '',
        address: body.address || '', notes: body.notes || '', createdAt: new Date().toISOString()
      });
      return sendJSON(res, 201, supplier);
    }
    const supplierMatch = pathname.match(/^\/api\/suppliers\/(\d+)$/);
    if (supplierMatch && req.method === 'PUT') {
      const body = await parseBody(req).catch(() => ({}));
      if (body.name !== undefined && !isNonEmpty(body.name, { min: 2, max: 100 })) {
        return sendJSON(res, 400, { error: 'Nom de fournisseur invalide' });
      }
      const updated = store.updateSupplier(Number(supplierMatch[1]), body);
      if (!updated) return sendJSON(res, 404, { error: 'Fournisseur introuvable' });
      return sendJSON(res, 200, updated);
    }
    if (supplierMatch && req.method === 'DELETE') {
      const ok = store.deleteSupplier(Number(supplierMatch[1]));
      if (!ok) return sendJSON(res, 404, { error: 'Fournisseur introuvable' });
      return sendJSON(res, 200, { success: true });
    }

    // ===== ARTICLES =====
    if (pathname === '/api/articles' && req.method === 'GET') {
      const search = searchParams.get('search') || '';
      const categoryId = searchParams.get('categoryId') || '';
      const lowStock = searchParams.get('lowStock') === 'true';
      return sendJSON(res, 200, store.getArticles({ search, categoryId, lowStock }));
    }

    if (pathname === '/api/articles/import' && req.method === 'POST') {
      const body = await parseBody(req).catch(() => ({}));
      if (!body.csv || typeof body.csv !== 'string') return sendJSON(res, 400, { error: 'Fichier CSV manquant' });
      const rows = parseCSV(body.csv);
      if (rows.length === 0) return sendJSON(res, 400, { error: 'Aucune ligne exploitable dans le fichier' });
      if (rows.length > 5000) return sendJSON(res, 400, { error: 'Trop de lignes (5000 maximum par import)' });
      const results = store.importArticles(rows);
      return sendJSON(res, 200, results);
    }

    const articleMatch = pathname.match(/^\/api\/articles\/(\d+)$/);
    if (articleMatch && req.method === 'GET') {
      const article = store.getArticleById(Number(articleMatch[1]));
      if (!article) return sendJSON(res, 404, { error: 'Article introuvable' });
      return sendJSON(res, 200, article);
    }

    if (pathname === '/api/articles' && req.method === 'POST') {
      const body = await parseBody(req).catch(() => ({}));
      const { name, unit, purchasePrice, salePrice, quantity, minStock, category, supplier, reference, description } = body;
      if (!isNonEmpty(name, { min: 2, max: 150 })) return sendJSON(res, 400, { error: 'Nom d\'article invalide' });
      if (!isPositiveNumber(purchasePrice)) return sendJSON(res, 400, { error: 'Prix d\'achat invalide' });
      if (!isPositiveNumber(salePrice)) return sendJSON(res, 400, { error: 'Prix de vente invalide' });
      if (!isPositiveInt(quantity)) return sendJSON(res, 400, { error: 'Quantité invalide' });
      if (minStock !== undefined && !isPositiveInt(minStock)) return sendJSON(res, 400, { error: 'Seuil d\'alerte invalide' });

      const categoryId = category ? store.ensureCategory(category) : null;
      const supplierId = supplier ? store.ensureSupplierByName(supplier) : null;

      const article = store.insertArticle({
        reference: reference || null, name: name.trim(), categoryId, unit: unit || 'pièce',
        purchasePrice: Number(purchasePrice), salePrice: Number(salePrice),
        quantity: Number(quantity) || 0, minStock: Number(minStock) || 0,
        supplierId, description: description || ''
      });
      return sendJSON(res, 201, article);
    }

    if (articleMatch && req.method === 'PUT') {
      const body = await parseBody(req).catch(() => ({}));
      const { name, unit, purchasePrice, salePrice, minStock, category, supplier, reference, description } = body;
      if (name !== undefined && !isNonEmpty(name, { min: 2, max: 150 })) return sendJSON(res, 400, { error: 'Nom d\'article invalide' });
      if (purchasePrice !== undefined && !isPositiveNumber(purchasePrice)) return sendJSON(res, 400, { error: 'Prix d\'achat invalide' });
      if (salePrice !== undefined && !isPositiveNumber(salePrice)) return sendJSON(res, 400, { error: 'Prix de vente invalide' });
      if (minStock !== undefined && !isPositiveInt(minStock)) return sendJSON(res, 400, { error: 'Seuil d\'alerte invalide' });

      const fields = {};
      if (name !== undefined) fields.name = name.trim();
      if (unit !== undefined) fields.unit = unit;
      if (purchasePrice !== undefined) fields.purchasePrice = Number(purchasePrice);
      if (salePrice !== undefined) fields.salePrice = Number(salePrice);
      if (minStock !== undefined) fields.minStock = Number(minStock);
      if (reference !== undefined) fields.reference = reference;
      if (description !== undefined) fields.description = description;
      if (category !== undefined) fields.categoryId = category ? store.ensureCategory(category) : null;
      if (supplier !== undefined) fields.supplierId = supplier ? store.ensureSupplierByName(supplier) : null;

      const updated = store.updateArticle(Number(articleMatch[1]), fields);
      if (!updated) return sendJSON(res, 404, { error: 'Article introuvable' });
      return sendJSON(res, 200, updated);
    }

    if (articleMatch && req.method === 'DELETE') {
      const ok = store.deleteArticle(Number(articleMatch[1]));
      if (!ok) return sendJSON(res, 404, { error: 'Article introuvable' });
      return sendJSON(res, 200, { success: true });
    }

    const stockMatch = pathname.match(/^\/api\/articles\/(\d+)\/stock$/);
    if (stockMatch && req.method === 'POST') {
      const body = await parseBody(req).catch(() => ({}));
      const { type, quantity, reason, note } = body;
      if (!['in', 'out', 'adjustment'].includes(type)) return sendJSON(res, 400, { error: 'Type de mouvement invalide' });
      if (!isPositiveInt(quantity)) return sendJSON(res, 400, { error: 'Quantité invalide' });

      const result = store.adjustStock(Number(stockMatch[1]), { type, quantity: Number(quantity), reason, note });
      if (!result) return sendJSON(res, 404, { error: 'Article introuvable' });
      if (result.error === 'INSUFFICIENT_STOCK') {
        return sendJSON(res, 400, { error: `Stock insuffisant (disponible : ${result.available})` });
      }
      return sendJSON(res, 200, result);
    }

    // ===== MOUVEMENTS =====
    if (pathname === '/api/movements' && req.method === 'GET') {
      const articleId = searchParams.get('articleId') || '';
      const type = searchParams.get('type') || '';
      return sendJSON(res, 200, store.getMovements({ articleId, type }));
    }

    // ===== VENTES =====
    if (pathname === '/api/sales' && req.method === 'GET') {
      const from = searchParams.get('from') || '';
      const to = searchParams.get('to') || '';
      return sendJSON(res, 200, store.getSales({ from, to }));
    }
    if (pathname === '/api/sales' && req.method === 'POST') {
      const body = await parseBody(req).catch(() => ({}));
      if (!Array.isArray(body.items) || body.items.length === 0) {
        return sendJSON(res, 400, { error: 'Le panier est vide' });
      }
      for (const item of body.items) {
        if (!item.articleId || !isPositiveInt(item.quantity) || item.quantity < 1) {
          return sendJSON(res, 400, { error: 'Article ou quantité invalide dans le panier' });
        }
      }
      try {
        const sale = store.createSale({
          items: body.items, clientName: body.clientName || '', paymentMethod: body.paymentMethod || 'espèces'
        });
        return sendJSON(res, 201, sale);
      } catch (e) {
        return sendJSON(res, 400, { error: e.message });
      }
    }
    const saleMatch = pathname.match(/^\/api\/sales\/(\d+)$/);
    if (saleMatch && req.method === 'GET') {
      const sale = store.getSaleById(Number(saleMatch[1]));
      if (!sale) return sendJSON(res, 404, { error: 'Vente introuvable' });
      return sendJSON(res, 200, sale);
    }

    const cancelSaleMatch = pathname.match(/^\/api\/sales\/(\d+)\/cancel$/);
    if (cancelSaleMatch && req.method === 'POST') {
      const result = store.cancelSale(Number(cancelSaleMatch[1]));
      if (result && result.error === 'NOT_FOUND') return sendJSON(res, 404, { error: 'Vente introuvable' });
      if (result && result.error === 'ALREADY_CANCELLED') return sendJSON(res, 400, { error: 'Cette vente est déjà annulée' });
      return sendJSON(res, 200, result);
    }

    // ===== Fichiers statiques =====
    if (req.method === 'GET') return serveStatic(req, res);

    return sendJSON(res, 404, { error: 'Route introuvable' });

  } catch (err) {
    console.error(err);
    return sendJSON(res, 500, { error: 'Erreur interne du serveur' });
  }
});

server.listen(PORT, () => {
  console.log(`StockPro — backend lancé sur http://localhost:${PORT}`);
  backup.startAutoBackup();
});
