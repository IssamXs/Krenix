// The exact Google Apps Script a Krenix merchant pastes into their
// Sheet's Extensions → Apps Script → code.gs to receive order rows.
// Kept in sync with the payload shape in src/lib/sheets.ts (SheetOrderPayload) —
// if that shape changes, update the row-building section below to match.
export const SHEETS_APPS_SCRIPT = `/**
 * Krenix → Google Sheets
 * Colle ce code dans Extensions > Apps Script (fichier Code.gs), remplace
 * tout le contenu existant, puis suis les étapes de déploiement dans Krenix.
 */

const SHEET_NAME = 'Commandes';
const HEADERS = ['Date', 'N° Commande', 'Client', 'Téléphone', 'Wilaya', 'Commune', 'Produit', 'Qté', 'Total (DA)', 'Statut', 'Source'];

const STATUS_LABELS = {
  pending: 'En attente',
  confirmed: 'Confirmée',
  chez_livreur: 'Chez livreur',
  en_livraison: 'En livraison',
  livree: 'Livrée',
  annulee: 'Annulée',
  retournee: 'Retournée',
};

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = getOrCreateSheet_();
    appendOrderRow_(sheet, data);
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getOrCreateSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    formatHeader_(sheet);
  }
  return sheet;
}

function formatHeader_(sheet) {
  const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#3C6E50');
  headerRange.setFontColor('#FFFFFF');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, HEADERS.length);
}

function appendOrderRow_(sheet, data) {
  const dateObj = data.date ? new Date(data.date) : new Date();
  const formattedDate = Utilities.formatDate(dateObj, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');

  sheet.appendRow([
    formattedDate,
    data.order_number || '',
    data.name || '',
    data.phone || '',
    data.wilaya || '',
    data.commune || '',
    data.product || '',
    data.quantity || 0,
    data.total || 0,
    STATUS_LABELS[data.status] || data.status || '',
    data.source || 'Krenix',
  ]);

  // Garde la feuille propre : bordures + colonnes ajustées sur chaque nouvelle ligne.
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow, 1, 1, HEADERS.length)
    .setBorder(true, true, true, true, true, true, '#E0E0E0', SpreadsheetApp.BorderStyle.SOLID);
  sheet.autoResizeColumns(1, HEADERS.length);
}

// Test manuel depuis l'éditeur Apps Script : sélectionne "testDoPost" puis Exécuter.
function testDoPost() {
  doPost({
    postData: {
      contents: JSON.stringify({
        order_number: 'TEST-0001',
        name: 'Client Test',
        phone: '0555 00 00 00',
        wilaya: 'Alger',
        commune: 'Alger Centre',
        product: 'Produit de test',
        quantity: 1,
        total: 2500,
        status: 'pending',
        source: 'test',
        date: new Date().toISOString(),
      }),
    },
  });
}
`
