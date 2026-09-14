// StockPro — sauvegardes automatiques de la base de données
//
// Copie data/stockpro.db vers data/backups/ à intervalles réguliers, et ne
// garde que les N sauvegardes les plus récentes pour ne pas remplir le disque.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'stockpro.db');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

const MAX_BACKUPS = Number(process.env.BACKUP_KEEP) || 14;
const INTERVAL_MS = Number(process.env.BACKUP_INTERVAL_HOURS || 24) * 60 * 60 * 1000;

function ensureBackupsDir() {
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

function timestampForFilename() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function runBackup() {
  try {
    if (!fs.existsSync(DB_PATH)) return null; // rien à sauvegarder pour l'instant
    ensureBackupsDir();

    const filename = `stockpro-${timestampForFilename()}.db`;
    const destPath = path.join(BACKUPS_DIR, filename);
    fs.copyFileSync(DB_PATH, destPath);

    pruneOldBackups();
    console.log(`Sauvegarde créée : data/backups/${filename}`);
    return filename;
  } catch (e) {
    console.error('Erreur lors de la sauvegarde automatique :', e.message);
    return null;
  }
}

function pruneOldBackups() {
  const files = listBackups();
  if (files.length <= MAX_BACKUPS) return;
  files.slice(MAX_BACKUPS).forEach(f => {
    try { fs.unlinkSync(path.join(BACKUPS_DIR, f.name)); } catch (e) { /* ignore */ }
  });
}

function listBackups() {
  ensureBackupsDir();
  return fs.readdirSync(BACKUPS_DIR)
    .filter(name => name.endsWith('.db'))
    .map(name => {
      const stat = fs.statSync(path.join(BACKUPS_DIR, name));
      return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getBackupPath(filename) {
  // empêche toute tentative de sortir du dossier des sauvegardes (../../etc)
  const safeName = path.basename(filename);
  const fullPath = path.join(BACKUPS_DIR, safeName);
  if (!fullPath.startsWith(BACKUPS_DIR) || !fs.existsSync(fullPath)) return null;
  return fullPath;
}

function startAutoBackup() {
  runBackup(); // une sauvegarde immédiate au démarrage du serveur
  const timer = setInterval(runBackup, INTERVAL_MS);
  timer.unref(); // ne bloque pas l'arrêt propre du serveur
}

module.exports = { runBackup, listBackups, getBackupPath, startAutoBackup };
