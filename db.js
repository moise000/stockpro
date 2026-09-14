// StockPro (quincaillerie) — couche base de données (SQLite via better-sqlite3)

const path = require('path');
const fs = require('fs');

let Database;
try {
  Database = require('better-sqlite3');
} catch (e) {
  console.error('\n❌ Le module "better-sqlite3" n\'est pas installé.');
  console.error('   Lance `npm install` dans ce dossier, puis relance le serveur.\n');
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'stockpro.db');
const db = new Database(DB_PATH);
db.exec('PRAGMA foreign_keys = ON');

// ---------- Schéma ----------
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    notes TEXT,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY,
    reference TEXT,
    name TEXT NOT NULL,
    categoryId INTEGER,
    unit TEXT NOT NULL DEFAULT 'pièce',
    purchasePrice REAL NOT NULL DEFAULT 0,
    salePrice REAL NOT NULL DEFAULT 0,
    quantity INTEGER NOT NULL DEFAULT 0,
    minStock INTEGER NOT NULL DEFAULT 0,
    supplierId INTEGER,
    description TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE SET NULL,
    FOREIGN KEY (supplierId) REFERENCES suppliers(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY,
    articleId INTEGER NOT NULL,
    type TEXT NOT NULL,       -- 'in' | 'out' | 'adjustment'
    quantity INTEGER NOT NULL,
    reason TEXT NOT NULL,     -- 'achat' | 'vente' | 'casse' | 'inventaire' | 'autre'
    note TEXT,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (articleId) REFERENCES articles(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY,
    total REAL NOT NULL,
    clientName TEXT,
    paymentMethod TEXT NOT NULL DEFAULT 'espèces',
    status TEXT NOT NULL DEFAULT 'completed',
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY,
    saleId INTEGER NOT NULL,
    articleId INTEGER,
    articleName TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unitPrice REAL NOT NULL,
    subtotal REAL NOT NULL,
    FOREIGN KEY (saleId) REFERENCES sales(id) ON DELETE CASCADE,
    FOREIGN KEY (articleId) REFERENCES articles(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(categoryId);
  CREATE INDEX IF NOT EXISTS idx_articles_supplier ON articles(supplierId);
  CREATE INDEX IF NOT EXISTS idx_movements_article ON stock_movements(articleId);
  CREATE INDEX IF NOT EXISTS idx_saleitems_sale ON sale_items(saleId);
`);

// Filet de sécurité pour une base créée avant l'ajout de l'annulation de vente
try {
  db.exec(`ALTER TABLE sales ADD COLUMN status TEXT NOT NULL DEFAULT 'completed'`);
} catch (e) { /* colonne déjà existante */ }

// =====================================================
// CATÉGORIES
// =====================================================
function getCategories() {
  return db.prepare('SELECT * FROM categories ORDER BY name').all();
}

function ensureCategory(name) {
  if (!name) return null;
  const clean = String(name).trim();
  db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)').run(clean);
  return db.prepare('SELECT id FROM categories WHERE name = ?').get(clean).id;
}

function deleteCategory(id) {
  const info = db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  return info.changes > 0;
}

// =====================================================
// FOURNISSEURS
// =====================================================
function getSuppliers() {
  return db.prepare(`
    SELECT s.*, (SELECT COUNT(*) FROM articles a WHERE a.supplierId = s.id) as articleCount
    FROM suppliers s ORDER BY s.name
  `).all();
}

function getSupplierById(id) {
  return db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id) || null;
}

function insertSupplier(s) {
  const info = db.prepare(`
    INSERT INTO suppliers (name, phone, email, address, notes, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(s.name, s.phone || '', s.email || '', s.address || '', s.notes || '', s.createdAt);
  return getSupplierById(info.lastInsertRowid);
}

function updateSupplier(id, fields) {
  const existing = getSupplierById(id);
  if (!existing) return null;
  const merged = { ...existing, ...fields };
  db.prepare(`
    UPDATE suppliers SET name=?, phone=?, email=?, address=?, notes=? WHERE id=?
  `).run(merged.name, merged.phone, merged.email, merged.address, merged.notes, id);
  return getSupplierById(id);
}

function deleteSupplier(id) {
  const info = db.prepare('DELETE FROM suppliers WHERE id = ?').run(id);
  return info.changes > 0;
}

function ensureSupplierByName(name) {
  if (!name) return null;
  const clean = String(name).trim();
  if (!clean) return null;
  const existing = db.prepare('SELECT id FROM suppliers WHERE name = ?').get(clean);
  if (existing) return existing.id;
  const info = db.prepare('INSERT INTO suppliers (name, phone, email, address, notes, createdAt) VALUES (?, ?, ?, ?, ?, ?)')
    .run(clean, '', '', '', '', new Date().toISOString());
  return info.lastInsertRowid;
}

// =====================================================
// ARTICLES
// =====================================================
const ARTICLE_SELECT = `
  SELECT a.*, c.name as categoryName, s.name as supplierName
  FROM articles a
  LEFT JOIN categories c ON c.id = a.categoryId
  LEFT JOIN suppliers s ON s.id = a.supplierId
`;

function getArticles({ search = '', categoryId = '', lowStock = false } = {}) {
  let sql = ARTICLE_SELECT;
  const clauses = [];
  const params = [];

  if (categoryId) {
    clauses.push('a.categoryId = ?');
    params.push(categoryId);
  }
  if (search) {
    clauses.push("(a.name || ' ' || IFNULL(a.reference,'') || ' ' || IFNULL(a.description,'')) LIKE ? COLLATE NOCASE");
    params.push(`%${search}%`);
  }
  if (lowStock) {
    clauses.push('a.quantity <= a.minStock');
  }
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY a.name';

  return db.prepare(sql).all(...params);
}

function getArticleById(id) {
  return db.prepare(ARTICLE_SELECT + ' WHERE a.id = ?').get(id) || null;
}

function insertArticle(a) {
  const now = new Date().toISOString();
  const info = db.prepare(`
    INSERT INTO articles (reference, name, categoryId, unit, purchasePrice, salePrice, quantity, minStock, supplierId, description, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(a.reference || null, a.name, a.categoryId || null, a.unit, a.purchasePrice, a.salePrice,
         a.quantity, a.minStock, a.supplierId || null, a.description || '', now, now);
  const id = info.lastInsertRowid;
  if (a.quantity > 0) {
    logMovement(id, 'in', a.quantity, 'inventaire', 'Stock initial');
  }
  return getArticleById(id);
}

function updateArticle(id, fields) {
  const existing = getArticleById(id);
  if (!existing) return null;
  const merged = { ...existing, ...fields };
  db.prepare(`
    UPDATE articles SET reference=?, name=?, categoryId=?, unit=?, purchasePrice=?, salePrice=?,
      minStock=?, supplierId=?, description=?, updatedAt=?
    WHERE id=?
  `).run(merged.reference || null, merged.name, merged.categoryId || null, merged.unit,
         merged.purchasePrice, merged.salePrice, merged.minStock, merged.supplierId || null,
         merged.description || '', new Date().toISOString(), id);
  return getArticleById(id);
}

function deleteArticle(id) {
  const info = db.prepare('DELETE FROM articles WHERE id = ?').run(id);
  return info.changes > 0;
}

function adjustStock(articleId, { type, quantity, reason, note }) {
  const article = getArticleById(articleId);
  if (!article) return null;

  let newQty;
  if (type === 'in') newQty = article.quantity + quantity;
  else if (type === 'out') newQty = article.quantity - quantity;
  else newQty = quantity; // 'adjustment' = valeur absolue (correction d'inventaire)

  if (newQty < 0) return { error: 'INSUFFICIENT_STOCK', available: article.quantity };

  db.prepare('UPDATE articles SET quantity = ?, updatedAt = ? WHERE id = ?')
    .run(newQty, new Date().toISOString(), articleId);

  const movementQty = type === 'adjustment' ? Math.abs(newQty - article.quantity) : quantity;
  const movementType = type === 'adjustment'
    ? (newQty >= article.quantity ? 'in' : 'out')
    : type;
  if (movementQty > 0) {
    logMovement(articleId, movementType, movementQty, reason || 'autre', note || '');
  }

  return getArticleById(articleId);
}

function importArticles(rows) {
  const results = { created: 0, updated: 0, errors: [] };
  const tx = db.transaction((items) => {
    items.forEach((row, i) => {
      try {
        if (!row.name || !row.name.trim()) {
          results.errors.push(`Ligne ${i + 1} : nom manquant`);
          return;
        }
        const categoryId = row.category ? ensureCategory(row.category) : null;
        const supplierId = row.supplier ? ensureSupplierByName(row.supplier) : null;

        const existing = row.reference
          ? db.prepare('SELECT id FROM articles WHERE reference = ?').get(row.reference)
          : null;

        if (existing) {
          updateArticle(existing.id, {
            name: row.name.trim(),
            categoryId,
            unit: row.unit || 'pièce',
            purchasePrice: row.purchasePrice || 0,
            salePrice: row.salePrice || 0,
            minStock: row.minStock || 0,
            supplierId,
            description: row.description || ''
          });
          if (row.quantity !== undefined && row.quantity !== null) {
            adjustStock(existing.id, { type: 'adjustment', quantity: row.quantity, reason: 'inventaire', note: 'Import CSV' });
          }
          results.updated++;
        } else {
          insertArticle({
            reference: row.reference || null,
            name: row.name.trim(),
            categoryId,
            unit: row.unit || 'pièce',
            purchasePrice: row.purchasePrice || 0,
            salePrice: row.salePrice || 0,
            quantity: row.quantity || 0,
            minStock: row.minStock || 0,
            supplierId,
            description: row.description || ''
          });
          results.created++;
        }
      } catch (e) {
        results.errors.push(`Ligne ${i + 1} : ${e.message}`);
      }
    });
  });
  tx(rows);
  return results;
}

// =====================================================
// MOUVEMENTS DE STOCK
// =====================================================
function logMovement(articleId, type, quantity, reason, note) {
  db.prepare(`
    INSERT INTO stock_movements (articleId, type, quantity, reason, note, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(articleId, type, quantity, reason, note || '', new Date().toISOString());
}

function getMovements({ articleId = '', type = '', limit = 200 } = {}) {
  let sql = `
    SELECT m.*, a.name as articleName, a.reference as articleReference
    FROM stock_movements m
    JOIN articles a ON a.id = m.articleId
  `;
  const clauses = [];
  const params = [];
  if (articleId) { clauses.push('m.articleId = ?'); params.push(articleId); }
  if (type) { clauses.push('m.type = ?'); params.push(type); }
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY m.createdAt DESC LIMIT ?';
  params.push(limit);
  return db.prepare(sql).all(...params);
}

// =====================================================
// VENTES
// =====================================================
function createSale({ items, clientName, paymentMethod }) {
  const tx = db.transaction(() => {
    // Vérifier le stock disponible avant toute écriture
    for (const item of items) {
      const article = getArticleById(item.articleId);
      if (!article) throw new Error(`Article introuvable (id ${item.articleId})`);
      if (article.quantity < item.quantity) {
        throw new Error(`Stock insuffisant pour "${article.name}" (disponible : ${article.quantity})`);
      }
    }

    let total = 0;
    const now = new Date().toISOString();
    const saleInfo = db.prepare('INSERT INTO sales (total, clientName, paymentMethod, createdAt) VALUES (0, ?, ?, ?)')
      .run(clientName || '', paymentMethod || 'espèces', now);
    const saleId = saleInfo.lastInsertRowid;

    for (const item of items) {
      const article = getArticleById(item.articleId);
      const unitPrice = article.salePrice;
      const subtotal = unitPrice * item.quantity;
      total += subtotal;

      db.prepare(`
        INSERT INTO sale_items (saleId, articleId, articleName, quantity, unitPrice, subtotal)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(saleId, article.id, article.name, item.quantity, unitPrice, subtotal);

      db.prepare('UPDATE articles SET quantity = quantity - ?, updatedAt = ? WHERE id = ?')
        .run(item.quantity, now, article.id);
      logMovement(article.id, 'out', item.quantity, 'vente', `Vente #${saleId}`);
    }

    db.prepare('UPDATE sales SET total = ? WHERE id = ?').run(total, saleId);
    return getSaleById(saleId);
  });

  return tx();
}

function getSales({ from = '', to = '', limit = 200 } = {}) {
  let sql = 'SELECT * FROM sales';
  const clauses = [];
  const params = [];
  if (from) { clauses.push('createdAt >= ?'); params.push(from); }
  if (to) { clauses.push('createdAt <= ?'); params.push(to); }
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY createdAt DESC LIMIT ?';
  params.push(limit);
  return db.prepare(sql).all(...params);
}

function getSaleById(id) {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(id);
  if (!sale) return null;
  sale.items = db.prepare('SELECT * FROM sale_items WHERE saleId = ?').all(id);
  return sale;
}

// Annule une vente : remet le stock des articles concernés, garde la vente
// dans l'historique (marquée "annulée") plutôt que de la supprimer.
function cancelSale(id) {
  const sale = getSaleById(id);
  if (!sale) return { error: 'NOT_FOUND' };
  if (sale.status === 'cancelled') return { error: 'ALREADY_CANCELLED' };

  const tx = db.transaction(() => {
    sale.items.forEach(item => {
      if (item.articleId) {
        adjustStock(item.articleId, {
          type: 'in',
          quantity: item.quantity,
          reason: 'annulation_vente',
          note: `Annulation de la vente #${id}`
        });
      }
    });
    db.prepare("UPDATE sales SET status = 'cancelled' WHERE id = ?").run(id);
  });
  tx();

  return getSaleById(id);
}

// =====================================================
// TABLEAU DE BORD / RAPPORTS
// =====================================================
function getDashboard() {
  const totalArticles = db.prepare('SELECT COUNT(*) as n FROM articles').get().n;
  const totalSuppliers = db.prepare('SELECT COUNT(*) as n FROM suppliers').get().n;
  const lowStockCount = db.prepare('SELECT COUNT(*) as n FROM articles WHERE quantity <= minStock').get().n;
  const stockValue = db.prepare('SELECT IFNULL(SUM(quantity * purchasePrice), 0) as v FROM articles').get().v;
  const potentialValue = db.prepare('SELECT IFNULL(SUM(quantity * salePrice), 0) as v FROM articles').get().v;

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todaySales = db.prepare("SELECT IFNULL(SUM(total),0) as v, COUNT(*) as n FROM sales WHERE createdAt >= ? AND status = 'completed'")
    .get(todayStart.toISOString());

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const monthSales = db.prepare("SELECT IFNULL(SUM(total),0) as v, COUNT(*) as n FROM sales WHERE createdAt >= ? AND status = 'completed'")
    .get(monthStart.toISOString());

  return {
    totalArticles,
    totalSuppliers,
    lowStockCount,
    stockValue,
    potentialValue,
    todaySalesTotal: todaySales.v,
    todaySalesCount: todaySales.n,
    monthSalesTotal: monthSales.v,
    monthSalesCount: monthSales.n
  };
}

function getTopArticles({ limit = 10, from = '' } = {}) {
  let sql = `
    SELECT si.articleId, si.articleName, SUM(si.quantity) as totalQty, SUM(si.subtotal) as totalRevenue
    FROM sale_items si
    JOIN sales s ON s.id = si.saleId
    WHERE s.status = 'completed'
  `;
  const params = [];
  if (from) { sql += ' AND s.createdAt >= ?'; params.push(from); }
  sql += ' GROUP BY si.articleId, si.articleName ORDER BY totalQty DESC LIMIT ?';
  params.push(limit);
  return db.prepare(sql).all(...params);
}

// Ventes des N derniers jours (une entrée par jour, 0 si aucune vente)
function getSalesByDay(days = 7) {
  const rows = db.prepare(`
    SELECT substr(createdAt, 1, 10) as day, SUM(total) as total, COUNT(*) as count
    FROM sales
    WHERE createdAt >= ? AND status = 'completed'
    GROUP BY day
  `).all(new Date(Date.now() - (days - 1) * 86400000).toISOString());

  const map = {};
  rows.forEach(r => { map[r.day] = r; });

  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    result.push({ day: key, total: map[key] ? map[key].total : 0, count: map[key] ? map[key].count : 0 });
  }
  return result;
}

// Valeur du stock (au prix de vente) répartie par catégorie
function getCategoryValueBreakdown() {
  return db.prepare(`
    SELECT IFNULL(c.name, 'Sans catégorie') as name, SUM(a.quantity * a.salePrice) as value, COUNT(*) as articleCount
    FROM articles a
    LEFT JOIN categories c ON c.id = a.categoryId
    GROUP BY c.id
    HAVING value > 0
    ORDER BY value DESC
  `).all();
}

module.exports = {
  getCategories, ensureCategory, deleteCategory,
  getSuppliers, getSupplierById, insertSupplier, updateSupplier, deleteSupplier, ensureSupplierByName,
  getArticles, getArticleById, insertArticle, updateArticle, deleteArticle, adjustStock, importArticles,
  getMovements,
  createSale, getSales, getSaleById, cancelSale,
  getDashboard, getTopArticles, getSalesByDay, getCategoryValueBreakdown
};

