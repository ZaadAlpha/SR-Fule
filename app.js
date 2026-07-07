const PINS = { entry: '1111', admin: '2222', owner: '3333' }; // change before upload
let currentRole = null;
let photoDataUrl = null;
let records = JSON.parse(localStorage.getItem('records') || '[]');
let settings = JSON.parse(localStorage.getItem('settings') || '{}');

document.addEventListener('DOMContentLoaded',()=>{ document.getElementById('date').valueAsDate=new Date(); addItem('DIESEL'); renderHistory(); refreshDashboard(); document.getElementById('scriptUrl').value=settings.scriptUrl||''; });
function login(){ const r=role.value, p=pin.value; if(PINS[r]!==p) return alert('Wrong PIN'); currentRole=r; loginScreen(false); }
function loginScreen(show){ document.getElementById('login').classList.toggle('hidden',!show); document.getElementById('app').classList.toggle('hidden',show); document.getElementById('who').textContent=currentRole?.toUpperCase()||''; document.querySelectorAll('[data-role]').forEach(el=>{el.style.display=el.dataset.role.includes(currentRole)?'block':'none'}); showPage(currentRole==='owner'?'reports':'dashboard'); }
function logout(){ currentRole=null; loginScreen(true); }
function showPage(id){ document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden')); document.getElementById(id).classList.remove('hidden'); pageTitle.textContent={dashboard:'Dashboard',invoice:'New Invoice',history:'History',reports:'Reports',settings:'Settings'}[id]; refreshDashboard(); renderHistory(); }
function previewPhoto(e){ const f=e.target.files[0]; if(!f)return; const reader=new FileReader(); reader.onload=()=>{photoDataUrl=reader.result; photoPreview.src=photoDataUrl; photoPreview.classList.remove('hidden')}; reader.readAsDataURL(f); }
function addItem(desc=''){ const tr=document.createElement('tr'); tr.innerHTML=`<td><input value="${desc}"></td><td><input type="number" value="0" oninput="calc()"></td><td><input value="LTR"></td><td><input type="number" step="0.0001" value="0" oninput="calc()"></td><td class="amt">0.00</td><td><button onclick="this.closest('tr').remove();calc()">X</button></td>`; itemsTable.querySelector('tbody').appendChild(tr); calc(); }
function getItems(){ return [...itemsTable.querySelectorAll('tbody tr')].map(tr=>{const i=tr.querySelectorAll('input'); const qty=+i[1].value||0, rate=+i[3].value||0; return {description:i[0].value, qty, uom:i[2].value, rate, amount:qty*rate}; }); }
function calc(){ let total=0; itemsTable.querySelectorAll('tbody tr').forEach(tr=>{const i=tr.querySelectorAll('input'); const amt=(+i[1].value||0)*(+i[3].value||0); tr.querySelector('.amt').textContent=amt.toFixed(2); total+=amt;}); grandTotal.textContent=total.toFixed(2); }

function normalizeOcrData(raw){
  // Apps Script may return either direct JSON, {ok:true,data:{...}}, or {result:{...}}
  let data = raw && (raw.data || raw.result || raw.invoice || raw);
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch(e) {}
  }
  if (!data || typeof data !== 'object') return {};

  const pick = (...keys) => {
    for (const k of keys) {
      if (data[k] !== undefined && data[k] !== null && data[k] !== '') return data[k];
    }
    return '';
  };

  let items = data.items || data.lineItems || data.products || data.fuelItems || [];

  // Some OCR returns fixed diesel/petrol fields instead of items array
  if (!Array.isArray(items) || items.length === 0) {
    items = [];
    const dieselQty = data.dieselQty || data.diesel_quantity || data.dieselQuantity;
    const dieselRate = data.dieselRate || data.diesel_rate;
    const petrolQty = data.petrolQty || data.petrol_quantity || data.petrolQuantity;
    const petrolRate = data.petrolRate || data.petrol_rate;
    if (dieselQty || dieselRate) items.push({ description:'DIESEL', qty:dieselQty || 0, uom:'LTR', rate:dieselRate || 0 });
    if (petrolQty || petrolRate) items.push({ description:'PETROL', qty:petrolQty || 0, uom:'LTR', rate:petrolRate || 0 });
  }

  items = (Array.isArray(items) ? items : []).map(x => ({
    description: x.description || x.fuel || x.fuelType || x.item || x.name || 'DIESEL',
    qty: Number(String(x.qty || x.quantity || x.litres || x.liters || 0).replace(/,/g,'')) || 0,
    uom: x.uom || x.unit || 'LTR',
    rate: Number(String(x.rate || x.unitPrice || x.price || 0).replace(/,/g,'')) || 0
  })).filter(x => x.description || x.qty || x.rate);

  return {
    invoiceNo: pick('invoiceNo','invoice_number','invoiceNumber','invoice','#'),
    date: toIsoDate(pick('date','invoiceDate','deliveryDate')),
    customer: pick('customer','customerName','billTo','bill_to','name'),
    doNo: pick('doNo','deliveryOrderNo','delivery_order_no','do_number','DO','do'),
    items
  };
}

function toIsoDate(v){
  if (!v) return '';
  v = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{1,2})[-\/ ]([A-Za-z]{3,}|\d{1,2})[-\/ ](\d{2,4})$/);
  if (!m) return v;
  const months = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
  let d=m[1].padStart(2,'0'), mo=m[2], y=m[3];
  if (isNaN(mo)) mo = months[mo.slice(0,3).toLowerCase()] || mo;
  else mo = String(mo).padStart(2,'0');
  if (y.length===2) y='20'+y;
  return `${y}-${mo}-${d}`;
}

function fillInvoiceForm(data){
  if(data.invoiceNo) invoiceNo.value = data.invoiceNo;
  if(data.date) date.value = data.date;
  if(data.customer) customer.value = data.customer;
  if(data.doNo) doNo.value = data.doNo;

  if(data.items && data.items.length){
    itemsTable.querySelector('tbody').innerHTML='';
    data.items.forEach(x=>{
      addItem(x.description || '');
      const tr = itemsTable.querySelector('tbody tr:last-child');
      const inputs = tr.querySelectorAll('input');
      inputs[1].value = x.qty || 0;
      inputs[2].value = x.uom || 'LTR';
      inputs[3].value = x.rate || 0;
    });
    calc();
  }
}

async function extractWithAI(){
  if(!photoDataUrl) return alert('Select photo first');
  if(!settings.scriptUrl) return alert('Add Apps Script URL in Settings first');
  aiStatus.textContent='Extracting...';
  try{
    const res = await fetch(settings.scriptUrl,{
      method:'POST',
      body:JSON.stringify({action:'ocr',image:photoDataUrl}),
      headers:{'Content-Type':'text/plain'}
    });
    const rawText = await res.text();
    console.log('OCR raw response:', rawText);
    let raw;
    try { raw = JSON.parse(rawText); } catch(e) { throw new Error('Apps Script did not return JSON: ' + rawText.slice(0,200)); }
    if(raw.ok === false) throw new Error(raw.error || 'OCR returned error');

    const data = normalizeOcrData(raw);
    console.log('OCR normalized data:', data);
    fillInvoiceForm(data);

    if(!data.customer && (!data.items || !data.items.length)){
      aiStatus.textContent='OCR returned data but fields were not recognized. Check browser Console.';
    } else {
      aiStatus.textContent='Done. Please review before saving.';
    }
  }catch(e){
    aiStatus.textContent='AI failed: ' + e.message;
    console.error(e);
  }
}
async function generateAndUpload(){
  calc();

  const rec = {
    invoiceNo: invoiceNo.value,
    date: date.value,
    customer: customer.value,
    doNo: doNo.value,
    items: getItems(),
    total: +grandTotal.textContent,
    createdAt: new Date().toISOString(),
    status: 'Local'
  };

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(0, 100, 90);
  doc.text('SR', 18, 25);

  doc.setFontSize(14);
  doc.text('Fuel Private Limited', 38, 25);

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(24);
  doc.text('Tax Invoice', 145, 22);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('TIN: 1174562CIT001', 150, 31);

  // Bill To box
  doc.setDrawColor(120);
  doc.roundedRect(14, 45, 92, 40, 2, 2);
  doc.setFillColor(200, 200, 200);
  doc.rect(14, 45, 92, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.text('Bill To', 18, 51);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(rec.customer || '', 18, 62, { maxWidth: 82 });

  // Date / Invoice box
  doc.roundedRect(138, 48, 58, 22, 2, 2);
  doc.setFillColor(200, 200, 200);
  doc.rect(138, 48, 58, 8, 'F');
  doc.line(167, 48, 167, 70);
  doc.setFont('helvetica', 'bold');
  doc.text('Date', 147, 54);
  doc.text('Invoice #', 172, 54);

  doc.setFont('helvetica', 'normal');
  doc.text(rec.date || '', 143, 64);
  doc.text(rec.invoiceNo || '', 171, 64);

  // Terms
  doc.setFont('helvetica', 'bold');
  doc.text('Terms', 145, 82);
  doc.setFont('helvetica', 'normal');
  doc.text('Due Date', 145, 91);
  doc.text(rec.date || '', 174, 91);
  doc.text('DO. #', 145, 100);
  doc.text(rec.doNo || '', 174, 100);
  doc.line(145, 84, 196, 84);
  doc.line(145, 93, 196, 93);
  doc.line(145, 102, 196, 102);

  // Items table
  let y = 115;
  doc.setFillColor(200, 200, 200);
  doc.rect(14, y, 182, 10, 'F');
  doc.rect(14, y, 182, 92);

  doc.setFont('helvetica', 'bold');
  doc.text('Description', 45, y + 7);
  doc.text('Qty', 98, y + 7);
  doc.text('UOM', 118, y + 7);
  doc.text('Rate', 145, y + 7);
  doc.text('Amount', 170, y + 7);

  doc.line(90, y, 90, y + 92);
  doc.line(110, y, 110, y + 92);
  doc.line(130, y, 130, y + 92);
  doc.line(160, y, 160, y + 92);

  doc.setFont('helvetica', 'normal');
  y += 18;

  rec.items.forEach(it => {
    if (!it.description && !it.qty) return;
    doc.text(String(it.description || ''), 18, y);
    doc.text(String(it.qty || ''), 98, y);
    doc.text(String(it.uom || 'LTR'), 117, y);
    doc.text(Number(it.rate || 0).toFixed(4), 140, y);
    doc.text(Number(it.amount || 0).toFixed(2), 170, y);
    y += 8;
  });

  // Payment text
  doc.setFontSize(10);
  doc.text('All payments should be made in favour of "S AND R FUEL PVT LTD"', 16, 214);
  doc.text('Payment should be made within 7 days from the date of invoice.', 16, 220);
  doc.text('Any discrepancies should be notified within 48 hrs.', 16, 226);

  doc.setFont('helvetica', 'bold');
  doc.text('Bank Details:', 16, 236);
  doc.setFont('helvetica', 'normal');
  doc.text('USD', 16, 244);
  doc.text('A/C Name: S AND R FUEL PVT LTD', 16, 250);
  doc.text('A/C Number : 7730000756084', 16, 256);
  doc.text('----------------------------------------', 16, 262);
  doc.text('MVR', 16, 268);
  doc.text('A/C Name: S AND R FUEL PVT LTD', 16, 274);
  doc.text('A/C Number : 7730000756083', 16, 280);

  // Totals box
  const boxX = 130;
  const boxY = 212;
  doc.roundedRect(boxX, boxY, 66, 44, 2, 2);
  doc.line(boxX, boxY + 11, boxX + 66, boxY + 11);
  doc.line(boxX, boxY + 22, boxX + 66, boxY + 22);
  doc.line(boxX, boxY + 33, boxX + 66, boxY + 33);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Subtotal', boxX + 5, boxY + 8);
  doc.text('GST (8.0%)', boxX + 5, boxY + 19);
  doc.text('Grand Total', boxX + 5, boxY + 30);
  doc.text('Balance Due', boxX + 5, boxY + 41);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`USD ${rec.total.toFixed(2)}`, boxX + 40, boxY + 8);
  doc.text('USD 0.00', boxX + 42, boxY + 19);
  doc.text(`USD ${rec.total.toFixed(2)}`, boxX + 40, boxY + 30);
  doc.text(`USD ${rec.total.toFixed(2)}`, boxX + 40, boxY + 41);

  // Signature / footer
  doc.setFont('helvetica', 'bold');
  doc.text('Thank you !', 96, 286);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Should you have any enquiries concerning this invoice, Please contact Ahmed Zaahid +960 9555088', 35, 292);
  doc.text('Daisy House, L. Kalaidhoo, Rep. of Maldives', 68, 297);
  doc.text('Tel: 9998971 | Tel: 9998516 | Email: sales@sandrfuel.com', 55, 301);

  // Page 2 original photo
  if(photoDataUrl){
    doc.addPage();
    doc.setFontSize(16);
    doc.text('Original Delivery Note Photo', 14, 18);
    doc.addImage(photoDataUrl, 'JPEG', 14, 28, 180, 0);
  }

  const pdfData = doc.output('datauristring');
  rec.pdfData = pdfData;

  if(settings.scriptUrl){
    try{
      const res = await fetch(settings.scriptUrl,{
        method:'POST',
        body:JSON.stringify({action:'save',record:rec,pdf:pdfData,image:photoDataUrl}),
        headers:{'Content-Type':'text/plain'}
      });
      const out = await res.json();
      rec.status = out.ok ? 'Uploaded' : 'Upload Failed';
      rec.pdfUrl = out.pdfUrl || '';
    }catch(e){
      rec.status = 'Upload Failed';
    }
  }

  records.push(rec);
  localStorage.setItem('records', JSON.stringify(records));
  renderHistory();
  refreshDashboard();
  alert('Invoice saved: ' + rec.status);
}
