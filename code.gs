/**
 * ECO-BYTE Premium — Google Apps Script backend
 * Data sheets: Audit, LKPD, Kuis, AI. API key and access codes are Script Properties.
 * Run setupEcoByte() once from the editor, then inspect the execution log for setup details.
 */
const APP_NAME = 'ECO-BYTE Premium';
const MODEL_NAME = 'gemini-3.1-flash-lite';
const SESSION_TTL_SECONDS = 21600; // 6 hours
const MAX_TEXT_LENGTH = 5000;
const SHEET_HEADERS = ['Timestamp','RecordId','Role','Type','Name','Class','PayloadJSON','UserKey'];

function doGet(e) {
  const page = e && e.parameter ? e.parameter.page : '';
  const file = page === 'home' ? 'Home' : 'Index';
  const title = page === 'home' ? 'ECO-BYTE | Eco-Audit Madrasah' : 'ECO-BYTE Premium | Eco-Audit Madrasah';
  return HtmlService.createHtmlOutputFromFile(file)
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function setupEcoByte() {
  const props = PropertiesService.getScriptProperties();
  let spreadsheetId = props.getProperty('SPREADSHEET_ID');
  let ss;
  if (spreadsheetId) {
    try { ss = SpreadsheetApp.openById(spreadsheetId); } catch (e) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create('ECO-BYTE Premium — Database Audit Madrasah');
    props.setProperty('SPREADSHEET_ID', ss.getId());
  }
  ['Audit','LKPD','Kuis','AI'].forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.appendRow(SHEET_HEADERS);
      sh.setFrozenRows(1);
      sh.getRange(1,1,1,SHEET_HEADERS.length).setFontWeight('bold').setBackground('#0b3027').setFontColor('#f7f3e8');
    }
  });
  const first = ss.getSheets()[0];
  if (!['Audit','LKPD','Kuis','AI'].includes(first.getName()) && ss.getSheets().length > 4) ss.deleteSheet(first);
  if (!props.getProperty('ADMIN_PIN')) props.setProperty('ADMIN_PIN', randomCode_(16));
  if (!props.getProperty('STUDENT_PIN')) props.setProperty('STUDENT_PIN', randomCode_(10));
  props.setProperty('SETUP_COMPLETE','true');
  Logger.log('ECO-BYTE SETUP COMPLETE');
  Logger.log('Spreadsheet URL: ' + ss.getUrl());
  Logger.log('ADMIN_PIN (rahasia): ' + props.getProperty('ADMIN_PIN'));
  Logger.log('STUDENT_PIN (bagikan kepada siswa): ' + props.getProperty('STUDENT_PIN'));
  Logger.log('Tambahkan GEMINI_API_KEY di Project Settings > Script Properties untuk mengaktifkan AI.');
  return {spreadsheetUrl:ss.getUrl(), message:'Setup selesai. Buka Execution log untuk PIN awal dan URL spreadsheet.'};
}

function apiLogin(pin, name, sClass) {
  assertSetup_();
  pin = String(pin || '').trim();
  if (!pin || pin.length > 100) throw new Error('Kode akses tidak valid.');
  const props = PropertiesService.getScriptProperties();
  const adminPin = props.getProperty('ADMIN_PIN');
  const studentPin = props.getProperty('STUDENT_PIN');
  let role = '';
  if (constantTimeEqual_(pin, adminPin)) role = 'admin';
  else if (constantTimeEqual_(pin, studentPin)) role = 'student';
  else throw new Error('Kode akses salah. Minta kode terbaru kepada guru/pengelola.');
  name = cleanText_(name, 100) || (role === 'admin' ? 'Guru/Admin' : 'Siswa');
  sClass = cleanText_(sClass, 20) || '-';
  if (role === 'student' && (!name || name === 'Siswa')) throw new Error('Siswa wajib mengisi nama.');
  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g,'');
  const user = {name:name, sClass:sClass};
  CacheService.getScriptCache().put('sess_' + token, JSON.stringify({role:role,user:user,created:Date.now()}), SESSION_TTL_SECONDS);
  return {token:token, role:role, user:user, expiresIn:SESSION_TTL_SECONDS};
}

function apiSaveRecord(token, type, payload) {
  const session = requireSession_(token);
  type = String(type || '');
  if (!['Audit','LKPD','Kuis'].includes(type)) throw new Error('Jenis data tidak dikenal.');
  if (session.role !== 'student' && session.role !== 'admin') throw new Error('Akses ditolak.');
  payload = sanitizePayload_(payload);
  const ss = getSpreadsheet_();
  const sh = ss.getSheetByName(type);
  const recordId = Utilities.getUuid();
  const now = new Date();
  let name = session.user.name;
  let sClass = session.user.sClass;
  if (session.role === 'admin') {
    name = cleanText_(payload.name,100) || name;
    sClass = cleanText_(payload.sClass,20) || sClass;
  }
  sh.appendRow([now,recordId,session.role,type,name,sClass,JSON.stringify(payload),userKey_(session.user)]);
  return {ok:true,recordId:recordId,type:type,timestamp:now.toISOString()};
}

function apiGetRecords(token) {
  const session = requireSession_(token);
  if (session.role !== 'admin') throw new Error('Hanya guru/admin yang dapat melihat rekap seluruh data.');
  const ss = getSpreadsheet_();
  const records = [];
  ['Audit','LKPD','Kuis','AI'].forEach(type => {
    const sh = ss.getSheetByName(type);
    if (!sh || sh.getLastRow() < 2) return;
    const values = sh.getRange(2,1,sh.getLastRow()-1,SHEET_HEADERS.length).getValues();
    values.forEach(row => records.push({timestamp:row[0] instanceof Date ? row[0].toISOString() : String(row[0]),recordId:String(row[1]),role:String(row[2]),type:String(row[3]),name:String(row[4]),sClass:String(row[5]),payload:safeParse_(row[6])}));
  });
  records.sort((a,b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  return {records:records.slice(0,1000),total:records.length};
}

function apiGenerateAdvice(token, metrics) {
  const session = requireSession_(token);
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('AI belum aktif. Pengelola perlu menambahkan GEMINI_API_KEY pada Script Properties.');
  metrics = sanitizePayload_(metrics || {});
  const prompt = [
    'Anda adalah pendamping pembelajaran Informatika dan ekoteologi Islam untuk siswa MTs Muhammadiyah Batang.',
    'Buat rekomendasi dalam Bahasa Indonesia, hangat, praktis, singkat (maksimal 120 kata), tidak menghakimi.',
    'Hubungkan efisiensi digital, pengurangan sampah plastik, amanah menjaga bumi, dan prinsip tidak israf/tabdzir.',
    'Angka jejak karbon dalam data adalah estimasi edukatif, bukan pengukuran ilmiah terverifikasi. Jangan menyatakan angka sebagai fakta pasti.',
    'Data audit: botol plastik per hari=' + number_(metrics.plasticPerDay) + ', item digital=' + number_(metrics.digitalItems) + ', periode hari=' + number_(metrics.days) + ', estimasi botol selama periode=' + number_(metrics.totalPlastic) + ', estimasi CO2e kg=' + number_(metrics.carbon) + '.',
    'Berikan 3 langkah konkret dan satu kalimat motivasi. Jangan meminta data pribadi.'
  ].join('\n');
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL_NAME + ':generateContent';
  const response = UrlFetchApp.fetch(url, {
    method:'post', contentType:'application/json', muteHttpExceptions:true,
    headers:{'x-goog-api-key':apiKey},
    payload:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0.6,maxOutputTokens:300}})
  });
  const status = response.getResponseCode();
  const body = response.getContentText();
  if (status < 200 || status >= 300) throw new Error('Gemini API mengembalikan status ' + status + '. Periksa API key, model, dan kuota.');
  const json = JSON.parse(body);
  const advice = (((json.candidates||[])[0]||{}).content||{}).parts;
  const text = (advice||[]).map(p=>p.text||'').join('\n').trim();
  if (!text) throw new Error('AI tidak mengembalikan teks. Coba lagi.');
  const sh = getSpreadsheet_().getSheetByName('AI');
  sh.appendRow([new Date(),Utilities.getUuid(),session.role,'AI',session.user.name,session.user.sClass,JSON.stringify({metrics:metrics,advice:text,model:MODEL_NAME}),userKey_(session.user)]);
  return {ok:true,advice:text,model:MODEL_NAME};
}

function apiHealth(token) {
  const session = requireSession_(token);
  return {ok:true,role:session.role,serverTime:new Date().toISOString(),aiConfigured:!!PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY')};
}

function getSpreadsheetUrlForAdmin() {
  const email = Session.getActiveUser().getEmail();
  const props = PropertiesService.getScriptProperties();
  const owner = props.getProperty('OWNER_EMAIL');
  if (!email || !owner || email.toLowerCase() !== owner.toLowerCase()) throw new Error('Hanya pemilik skrip yang boleh menjalankan fungsi ini.');
  return getSpreadsheet_().getUrl();
}

function requireSession_(token) {
  if (!token || String(token).length > 200) throw new Error('Sesi tidak valid. Silakan masuk kembali.');
  const raw = CacheService.getScriptCache().get('sess_' + token);
  if (!raw) throw new Error('Sesi berakhir. Silakan masuk kembali.');
  return JSON.parse(raw);
}
function assertSetup_() { if (PropertiesService.getScriptProperties().getProperty('SETUP_COMPLETE') !== 'true') throw new Error('Jalankan setupEcoByte() terlebih dahulu dari editor Apps Script.'); }
function getSpreadsheet_() { assertSetup_(); const id=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID'); if(!id)throw new Error('SPREADSHEET_ID belum diatur. Jalankan setupEcoByte().'); return SpreadsheetApp.openById(id); }
function sanitizePayload_(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Format data tidak valid.');
  const out={};
  Object.keys(payload).slice(0,40).forEach(k=>{
    const key=String(k).slice(0,60); const v=payload[k];
    if (v===null || ['string','number','boolean'].includes(typeof v)) out[key]=typeof v==='string'?cleanText_(v,MAX_TEXT_LENGTH):v;
    else if (Array.isArray(v)) out[key]=v.slice(0,50).map(x=>typeof x==='string'?cleanText_(x,1000):x).filter(x=>x===null||['string','number','boolean'].includes(typeof x));
    else if (typeof v==='object') out[key]=JSON.stringify(v).slice(0,MAX_TEXT_LENGTH);
  });
  return out;
}
function cleanText_(v,max) { return String(v==null?'':v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').trim().slice(0,max||500); }
function randomCode_(length) { const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$'; let out=''; for(let i=0;i<length;i++)out+=chars[Math.floor(Math.random()*chars.length)]; return out; }
function constantTimeEqual_(a,b) { if(!a||!b)return false; a=String(a);b=String(b);let diff=a.length^b.length;const n=Math.max(a.length,b.length);for(let i=0;i<n;i++)diff|=(a.charCodeAt(i%a.length)||0)^(b.charCodeAt(i%b.length)||0);return diff===0; }
function userKey_(user) { return Utilities.base64EncodeWebSafe(String(user.name||'')+'|'+String(user.sClass||'')); }
function safeParse_(v) { try{return JSON.parse(String(v||'{}'));}catch(e){return {raw:String(v||'')};} }
function number_(v) { const n=Number(v); return Number.isFinite(n)?String(n):'0'; }
