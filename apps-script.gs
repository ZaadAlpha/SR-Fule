// Google Apps Script backend for GitHub-only frontend.
// Script Properties needed: OPENAI_API_KEY, DRIVE_FOLDER_ID, SHEET_ID
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    if (body.action === 'ocr') return json(ocr(body.image));
    if (body.action === 'save') return json(saveInvoice(body.record, body.pdf, body.image));
    return json({ ok:false, error:'Unknown action' });
  } catch (err) { return json({ ok:false, error:String(err) }); }
}
function json(obj){ return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function ocr(imageDataUrl) {
  const key = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!key) return { ok:false, error:'OPENAI_API_KEY missing' };
  const payload = {
    model: 'gpt-4o-mini',
    messages: [{ role:'user', content:[
      { type:'text', text:'Extract this fuel delivery note. Return JSON only: invoiceNo,date YYYY-MM-DD,customer,doNo,items[{description,qty,uom,rate}]' },
      { type:'image_url', image_url:{ url:imageDataUrl } }
    ]}],
    response_format:{ type:'json_object' }
  };
  const res = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', { method:'post', contentType:'application/json', headers:{Authorization:'Bearer '+key}, payload:JSON.stringify(payload), muteHttpExceptions:true });
  const obj = JSON.parse(res.getContentText());
  return JSON.parse(obj.choices[0].message.content);
}
function saveInvoice(record, pdfDataUrl, imageDataUrl) {
  const folderId = PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID');
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const folder = DriveApp.getFolderById(folderId);
  const pdfBlob = Utilities.newBlob(Utilities.base64Decode(pdfDataUrl.split(',')[1]), 'application/pdf', record.invoiceNo + '.pdf');
  const pdfFile = folder.createFile(pdfBlob);
  let photoUrl = '';
  if (imageDataUrl) {
    const imgBlob = Utilities.newBlob(Utilities.base64Decode(imageDataUrl.split(',')[1]), 'image/jpeg', record.invoiceNo + '_photo.jpg');
    photoUrl = folder.createFile(imgBlob).getUrl();
  }
  const sh = SpreadsheetApp.openById(sheetId).getSheets()[0];
  sh.appendRow([new Date(), record.invoiceNo, record.date, record.customer, record.doNo, JSON.stringify(record.items), record.total, pdfFile.getUrl(), photoUrl]);
  return { ok:true, pdfUrl:pdfFile.getUrl(), photoUrl:photoUrl };
}
