/**
 * FDC Dentist: Foto kenangan upload (Google Apps Script web app).
 *
 * The headset sends the finished photo card here; this script saves it in your Google Drive
 * (folder "FDC Dentist - Foto Kenangan"), shares that one file as "anyone with the link can view",
 * and returns a direct download link. The game turns that link into the QR on the card.
 *
 * Set up (once, about 5 minutes): see README → "Foto kenangan download".
 *   1. script.google.com → New project → paste this file → Save.
 *   2. Deploy → New deployment → type "Web app":
 *        Execute as: Me    Who has access: Anyone
 *   3. Copy the Web app URL into BOOTH.photoUploadUrl in src/game/config.js and push.
 *
 * KEY must match BOOTH.photoUploadKey in config.js (it only stops random uploads; change both if you like).
 */
const KEY = 'fdc-fest';
const FOLDER_NAME = 'FDC Dentist - Foto Kenangan';
const MAX_BYTES = 3 * 1024 * 1024;

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.key !== KEY) return reply({ error: 'wrong key' });
    const bytes = Utilities.base64Decode(data.image);
    if (!bytes.length || bytes.length > MAX_BYTES) return reply({ error: 'bad image' });
    const name = String(data.name || 'FDC-foto.jpg').replace(/[^\w.\-]+/g, '-').slice(0, 80);
    const file = folder().createFile(Utilities.newBlob(bytes, 'image/jpeg', name));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const id = file.getId();
    return reply({ id, download: 'https://drive.google.com/uc?export=download&id=' + id, view: file.getUrl() });
  } catch (err) {
    return reply({ error: String(err) });
  }
}

// Open the web app URL in a browser to check it is deployed.
function doGet() {
  return reply({ ok: true, folder: FOLDER_NAME });
}

function folder() {
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
