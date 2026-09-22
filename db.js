// StockPro (quincaillerie) — couche base de données (SQLite via node:sqlite,
// intégré à Node.js — voir sqlite-driver.js pour le détail du choix)

const path = require('path');
const fs = require('fs');
const Database = require('./sqlite-driver.js');

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

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS debts (
    id INTEGER PRIMARY KEY,
    customerId INTEGER NOT NULL,
    amount REAL NOT NULL,
    note TEXT,
    saleId INTEGER,
    status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'paid'
    createdAt TEXT NOT NULL,
    FOREIGN KEY (customerId) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (saleId) REFERENCES sales(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS debt_payments (
    id INTEGER PRIMARY KEY,
    debtId INTEGER NOT NULL,
    amount REAL NOT NULL,
    note TEXT,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (debtId) REFERENCES debts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS restock_items (
    id INTEGER PRIMARY KEY,
    articleId INTEGER,
    label TEXT NOT NULL,
    note TEXT,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (articleId) REFERENCES articles(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(categoryId);
  CREATE INDEX IF NOT EXISTS idx_articles_supplier ON articles(supplierId);
  CREATE INDEX IF NOT EXISTS idx_movements_article ON stock_movements(articleId);
  CREATE INDEX IF NOT EXISTS idx_saleitems_sale ON sale_items(saleId);
  CREATE INDEX IF NOT EXISTS idx_saleitems_article ON sale_items(articleId);
  CREATE INDEX IF NOT EXISTS idx_sales_createdat ON sales(createdAt);
  CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
  CREATE INDEX IF NOT EXISTS idx_movements_createdat ON stock_movements(createdAt);
  CREATE INDEX IF NOT EXISTS idx_debts_customer ON debts(customerId);
  CREATE INDEX IF NOT EXISTS idx_debts_status ON debts(status);
  CREATE INDEX IF NOT EXISTS idx_debtpayments_debt ON debt_payments(debtId);
  CREATE INDEX IF NOT EXISTS idx_restockitems_article ON restock_items(articleId);
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

// Recherche un article déjà existant qui correspond au même modèle — par
// référence si elle est fournie (la façon la plus fiable), sinon par nom
// exact (insensible à la casse et aux espaces superflus).
function findMatchingArticle({ reference, name }) {
  if (reference && String(reference).trim()) {
    const byRef = db.prepare('SELECT * FROM articles WHERE reference = ?').get(String(reference).trim());
    if (byRef) return byRef;
  }
  if (name && String(name).trim()) {
    const byName = db.prepare('SELECT * FROM articles WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))').get(name);
    if (byName) return byName;
  }
  return null;
}

// Si un article du même modèle existe déjà (même référence, ou même nom),
// la quantité saisie vient s'ajouter à celle déjà en stock — jamais de
// doublon créé pour un simple réapprovisionnement du même article. Seule
// la quantité est fusionnée ; le prix, la catégorie, etc. de la fiche déjà
// existante restent inchangés (pour les modifier, on édite la fiche).
function insertOrMergeArticle(a) {
  const existing = findMatchingArticle({ reference: a.reference, name: a.name });
  if (existing) {
    const merged = adjustStock(existing.id, {
      type: 'in', quantity: a.quantity, reason: 'inventaire', note: 'Réapprovisionnement (même article)'
    });
    return { article: merged, merged: true, previousQuantity: existing.quantity };
  }
  const created = insertArticle(a);
  return { article: created, merged: false };
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
      // Prix modifié à la caisse s'il est fourni (remise, négociation...), sinon prix catalogue.
      const unitPrice = (item.unitPrice !== undefined && item.unitPrice !== null && item.unitPrice !== '')
        ? Number(item.unitPrice)
        : article.salePrice;
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

    // Vente à crédit : une dette est notée automatiquement pour ce client,
    // du montant total de la vente.
    if ((paymentMethod || '').trim() === 'crédit' && clientName && clientName.trim()) {
      const customerId = ensureCustomerByName(clientName.trim());
      createDebt({ customerId, amount: total, note: `Vente #${saleId}`, saleId });
    }

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
// CLIENTS & DETTES
// =====================================================
function getCustomers({ search = '' } = {}) {
  let sql = `
    SELECT c.*,
      IFNULL((SELECT SUM(d.amount) FROM debts d WHERE d.customerId = c.id), 0) as totalDebt,
      IFNULL((SELECT SUM(p.amount) FROM debt_payments p JOIN debts d ON d.id = p.debtId WHERE d.customerId = c.id), 0) as totalPaid,
      (SELECT COUNT(*) FROM debts d WHERE d.customerId = c.id AND d.status = 'active') as activeDebtCount
    FROM customers c
  `;
  const params = [];
  if (search) {
    sql += " WHERE (c.name || ' ' || IFNULL(c.phone,'')) LIKE ? COLLATE NOCASE";
    params.push(`%${search}%`);
  }
  sql += ' ORDER BY c.name';
  return db.prepare(sql).all(...params).map(c => ({ ...c, balance: c.totalDebt - c.totalPaid }));
}

function getCustomerById(id) {
  const rows = getCustomers({});
  return rows.find(c => c.id === id) || null;
}

function insertCustomer({ name, phone }) {
  const info = db.prepare('INSERT INTO customers (name, phone, createdAt) VALUES (?, ?, ?)')
    .run(name.trim(), phone || '', new Date().toISOString());
  return getCustomerById(info.lastInsertRowid);
}

function updateCustomer(id, fields) {
  const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  if (!existing) return null;
  const merged = { ...existing, ...fields };
  db.prepare('UPDATE customers SET name=?, phone=? WHERE id=?').run(merged.name, merged.phone || '', id);
  return getCustomerById(id);
}

function deleteCustomer(id) {
  const debtCount = db.prepare('SELECT COUNT(*) as n FROM debts WHERE customerId = ?').get(id).n;
  if (debtCount > 0) return { error: 'HAS_DEBTS' };
  const info = db.prepare('DELETE FROM customers WHERE id = ?').run(id);
  return { success: info.changes > 0 };
}

// Trouve un client existant par nom (insensible à la casse/espaces), sinon
// en crée un — utilisé pour rattacher une vente à crédit ou une dette notée
// à la main à une fiche client réutilisable.
function ensureCustomerByName(name, phone) {
  const clean = String(name).trim();
  const existing = db.prepare('SELECT id FROM customers WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))').get(clean);
  if (existing) {
    if (phone) db.prepare('UPDATE customers SET phone = ? WHERE id = ? AND (phone IS NULL OR phone = ?)').run(phone, existing.id, '');
    return existing.id;
  }
  const info = db.prepare('INSERT INTO customers (name, phone, createdAt) VALUES (?, ?, ?)')
    .run(clean, phone || '', new Date().toISOString());
  return info.lastInsertRowid;
}

function getDebtById(id) {
  const debt = db.prepare(`
    SELECT d.*, c.name as customerName, c.phone as customerPhone
    FROM debts d JOIN customers c ON c.id = d.customerId
    WHERE d.id = ?
  `).get(id);
  if (!debt) return null;
  debt.payments = db.prepare('SELECT * FROM debt_payments WHERE debtId = ? ORDER BY createdAt DESC').all(id);
  const paid = debt.payments.reduce((sum, p) => sum + p.amount, 0);
  debt.paid = paid;
  debt.remaining = Math.max(0, debt.amount - paid);
  return debt;
}

function createDebt({ customerId, amount, note, saleId }) {
  const info = db.prepare(`
    INSERT INTO debts (customerId, amount, note, saleId, status, createdAt)
    VALUES (?, ?, ?, ?, 'active', ?)
  `).run(customerId, amount, note || '', saleId || null, new Date().toISOString());
  return getDebtById(info.lastInsertRowid);
}

function getDebts({ customerId = '', status = '' } = {}) {
  let sql = `
    SELECT d.*, c.name as customerName, c.phone as customerPhone,
      IFNULL((SELECT SUM(amount) FROM debt_payments WHERE debtId = d.id), 0) as paid
    FROM debts d JOIN customers c ON c.id = d.customerId
  `;
  const clauses = [];
  const params = [];
  if (customerId) { clauses.push('d.customerId = ?'); params.push(customerId); }
  if (status) { clauses.push('d.status = ?'); params.push(status); }
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY d.createdAt DESC';
  return db.prepare(sql).all(...params).map(d => ({ ...d, remaining: Math.max(0, d.amount - d.paid) }));
}

// Enregistre un remboursement (partiel ou total) sur une dette. Le montant
// ne peut pas dépasser ce qu'il reste à payer.
function addDebtPayment(debtId, { amount, note }) {
  const debt = getDebtById(debtId);
  if (!debt) return { error: 'NOT_FOUND' };
  if (debt.status === 'paid') return { error: 'ALREADY_PAID' };
  if (amount > debt.remaining + 0.01) return { error: 'AMOUNT_EXCEEDS_BALANCE', remaining: debt.remaining };

  const tx = db.transaction(() => {
    db.prepare('INSERT INTO debt_payments (debtId, amount, note, createdAt) VALUES (?, ?, ?, ?)')
      .run(debtId, amount, note || '', new Date().toISOString());
    const newRemaining = debt.remaining - amount;
    if (newRemaining <= 0.01) {
      db.prepare("UPDATE debts SET status = 'paid' WHERE id = ?").run(debtId);
    }
  });
  tx();

  return getDebtById(debtId);
}

// =====================================================
// PRODUITS MANQUANTS / À COMMANDER
// =====================================================
// Liste tenue à la main par le gérant : soit un article déjà au catalogue
// (identifié automatiquement par son nom), soit un tout nouveau produit pas
// encore vendu. Un article du catalogue sort automatiquement de la liste
// dès que son stock repasse au-dessus du seuil d'alerte ; un nouveau
// produit (jamais lié à une fiche article) reste jusqu'à suppression
// manuelle, faute de stock à surveiller.
const RESTOCK_SELECT = `
  SELECT r.*, a.name as articleName, a.quantity as articleQuantity,
         a.minStock as articleMinStock, a.unit as articleUnit
  FROM restock_items r
  LEFT JOIN articles a ON a.id = r.articleId
`;

function getRestockItems() {
  const rows = db.prepare(`
    ${RESTOCK_SELECT}
    WHERE r.articleId IS NULL OR a.quantity <= a.minStock
    ORDER BY r.createdAt DESC
  `).all();
  return rows.map(r => ({
    ...r,
    isCatalogArticle: r.articleId !== null,
    displayName: r.articleId !== null ? r.articleName : r.label
  }));
}

function getRestockItemById(id) {
  const r = db.prepare(`${RESTOCK_SELECT} WHERE r.id = ?`).get(id);
  if (!r) return null;
  return { ...r, isCatalogArticle: r.articleId !== null, displayName: r.articleId !== null ? r.articleName : r.label };
}

// Si le texte tapé correspond exactement (insensible à la casse) à un
// article déjà au catalogue, l'entrée est liée à cet article ; sinon
// c'est noté comme un nouveau produit.
function insertRestockItem({ label, note }) {
  const clean = String(label).trim();
  const match = findMatchingArticle({ name: clean });
  const info = db.prepare(`
    INSERT INTO restock_items (articleId, label, note, createdAt)
    VALUES (?, ?, ?, ?)
  `).run(match ? match.id : null, clean, note || '', new Date().toISOString());
  return getRestockItemById(info.lastInsertRowid);
}

function deleteRestockItem(id) {
  const info = db.prepare('DELETE FROM restock_items WHERE id = ?').run(id);
  return info.changes > 0;
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

// Suggestions de réapprovisionnement — contrairement au simple "stock bas"
// (quantité déjà sous le seuil), ceci estime le nombre de jours avant
// rupture en se basant sur le vrai rythme de vente des 30 derniers jours,
// et propose une quantité à commander. Un article encore au-dessus du
// seuil mais qui se vend vite peut ainsi être détecté à l'avance.
function getReorderSuggestions({ daysWindow = 30, alertThresholdDays = 7 } = {}) {
  const since = new Date(Date.now() - daysWindow * 86400000).toISOString();

  const sold = db.prepare(`
    SELECT si.articleId, SUM(si.quantity) as totalSold
    FROM sale_items si
    JOIN sales s ON s.id = si.saleId
    WHERE s.createdAt >= ? AND s.status = 'completed' AND si.articleId IS NOT NULL
    GROUP BY si.articleId
  `).all(since);
  const soldMap = {};
  sold.forEach(r => { soldMap[r.articleId] = r.totalSold; });

  const articles = db.prepare('SELECT * FROM articles').all();

  const suggestions = articles.map(a => {
    const totalSold = soldMap[a.id] || 0;
    const dailyRate = totalSold / daysWindow;
    const daysRemaining = dailyRate > 0 ? a.quantity / dailyRate : null;
    // Quantité pour retrouver ~30 jours d'avance au rythme actuel, jamais négative.
    const suggestedQty = dailyRate > 0 ? Math.max(0, Math.ceil(dailyRate * daysWindow - a.quantity)) : 0;
    const alreadyLow = a.quantity <= a.minStock;
    const trendingLow = daysRemaining !== null && daysRemaining <= alertThresholdDays;
    return {
      articleId: a.id, name: a.name, reference: a.reference, quantity: a.quantity, minStock: a.minStock,
      dailyRate: Math.round(dailyRate * 10) / 10,
      daysRemaining: daysRemaining !== null ? Math.round(daysRemaining) : null,
      suggestedQty, alreadyLow, trendingLow
    };
  }).filter(s => s.alreadyLow || s.trendingLow);

  // Les plus urgents (rupture la plus proche, ou déjà en rupture) en premier.
  suggestions.sort((a, b) => {
    const da = a.daysRemaining === null ? (a.alreadyLow ? -1 : 999) : a.daysRemaining;
    const db_ = b.daysRemaining === null ? (b.alreadyLow ? -1 : 999) : b.daysRemaining;
    return da - db_;
  });

  return suggestions;
}

module.exports = {
  getCategories, ensureCategory, deleteCategory,
  getSuppliers, getSupplierById, insertSupplier, updateSupplier, deleteSupplier, ensureSupplierByName,
  getArticles, getArticleById, insertArticle, insertOrMergeArticle, updateArticle, deleteArticle, adjustStock, importArticles,
  getMovements,
  createSale, getSales, getSaleById, cancelSale,
  getCustomers, getCustomerById, insertCustomer, updateCustomer, deleteCustomer, ensureCustomerByName,
  getDebts, getDebtById, createDebt, addDebtPayment,
  getRestockItems, getRestockItemById, insertRestockItem, deleteRestockItem,
  getDashboard, getTopArticles, getSalesByDay, getCategoryValueBreakdown, getReorderSuggestions
};

