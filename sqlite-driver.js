// StockPro — accès SQLite via node:sqlite (intégré à Node.js depuis la
// version 22.5) au lieu de better-sqlite3.
//
// Pourquoi ce changement : better-sqlite3 est un module natif qui doit être
// recompilé (en C++) au moment de `npm install`. Sur certains hébergeurs
// (Render notamment), la version de Node installée est trop récente et la
// compilation échoue avec des erreurs internes à V8. node:sqlite fait partie
// de Node lui-même : aucune compilation, aucune installation supplémentaire,
// ça fonctionne du premier coup quelle que soit la version de Node (à partir
// de 22.5) et quel que soit l'hébergeur.
//
// Ce fichier expose la même API que better-sqlite3 (celle utilisée par
// db.js : prepare/run/get/all, exec, transaction, pragma, close) pour que le
// reste du code n'ait rien à changer.

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  console.error('\n❌ Ce serveur Node.js ne propose pas node:sqlite.');
  console.error('   node:sqlite nécessite Node.js 22.5 ou plus récent.');
  console.error(`   Version actuelle : ${process.version}\n`);
  console.error('   Sur certaines versions un peu anciennes de Node 22/23, il faut');
  console.error('   ajouter la variable d\'environnement NODE_OPTIONS=--experimental-sqlite\n');
  process.exit(1);
}

class Statement {
  constructor(stmt) {
    this.stmt = stmt;
  }
  run(...args) {
    const r = this.stmt.run(...args);
    return { lastInsertRowid: r.lastInsertRowid, changes: r.changes };
  }
  get(...args) {
    return this.stmt.get(...args);
  }
  all(...args) {
    return this.stmt.all(...args);
  }
}

class Database {
  constructor(filename) {
    this.db = new DatabaseSync(filename);
  }
  exec(sql) {
    this.db.exec(sql);
    return this;
  }
  prepare(sql) {
    return new Statement(this.db.prepare(sql));
  }
  // Reproduit db.transaction(fn) de better-sqlite3 : retourne une fonction
  // qui exécute fn(...args) entre BEGIN/COMMIT, avec ROLLBACK automatique en
  // cas d'erreur.
  transaction(fn) {
    const self = this;
    return (...args) => {
      self.db.exec('BEGIN');
      try {
        const result = fn(...args);
        self.db.exec('COMMIT');
        return result;
      } catch (e) {
        try { self.db.exec('ROLLBACK'); } catch (_) { /* transaction déjà annulée */ }
        throw e;
      }
    };
  }
  pragma(str) {
    try { this.db.exec('PRAGMA ' + str); } catch (e) { /* pragma non critique */ }
  }
  close() {
    this.db.close();
  }
}

module.exports = Database;
