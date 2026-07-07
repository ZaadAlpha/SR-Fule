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
async function generateAndUpload(){ calc(); const rec={invoiceNo:invoiceNo.value,date:date.value,customer:customer.value,doNo:doNo.value,items:getItems(),total:+grandTotal.textContent,createdAt:new Date().toISOString(),status:'Local'}; const {jsPDF}=window.jspdf; const doc=new jsPDF(); doc.setFontSize(18); doc.text('Tax Invoice',14,18); doc.setFontSize(10); doc.text('S AND R FUEL PVT LTD',14,28); doc.text('TIN: 1174562CIT001',14,34); doc.text(`Invoice #: ${rec.invoiceNo}`,140,28); doc.text(`Date: ${rec.date}`,140,34); doc.text(`Bill To: ${rec.customer}`,14,48); doc.text(`DO #: ${rec.doNo}`,14,54); let y=70; doc.text('Description',14,y); doc.text('Qty',85,y); doc.text('UOM',110,y); doc.text('Rate',135,y); doc.text('Amount',165,y); y+=8; rec.items.forEach(it=>{doc.text(String(it.description),14,y); doc.text(String(it.qty),85,y); doc.text(String(it.uom),110,y); doc.text(String(it.rate),135,y); doc.text(it.amount.toFixed(2),165,y); y+=8;}); doc.setFontSize(14); doc.text(`Grand Total: ${rec.total.toFixed(2)}`,130,y+8); doc.setFontSize(9); doc.text('Thank you! All payments should be made in favour of S AND R FUEL PVT LTD',14,280); if(photoDataUrl){doc.addPage(); doc.text('Original Delivery Note Photo',14,14); doc.addImage(photoDataUrl,'JPEG',14,24,180,0);} const pdfData=doc.output('datauristring'); rec.pdfData=pdfData; if(settings.scriptUrl){ try{ const res=await fetch(settings.scriptUrl,{method:'POST',body:JSON.stringify({action:'save',record:rec,pdf:pdfData,image:photoDataUrl}),headers:{'Content-Type':'text/plain'}}); const out=await res.json(); rec.status=out.ok?'Uploaded':'Upload Failed'; rec.pdfUrl=out.pdfUrl||''; }catch(e){ rec.status='Upload Failed'; }} records.push(rec); localStorage.setItem('records',JSON.stringify(records)); renderHistory(); refreshDashboard(); alert('Invoice saved: '+rec.status); }
function renderHistory(){ const tb=historyTable?.querySelector('tbody'); if(!tb)return; tb.innerHTML=''; records.slice().reverse().forEach(r=>{tb.innerHTML+=`<tr><td>${r.invoiceNo}</td><td>${r.date}</td><td>${r.customer}</td><td>${r.total.toFixed(2)}</td><td>${r.status}</td></tr>`;}); }
function refreshDashboard(){ const today=new Date().toISOString().slice(0,10), month=today.slice(0,7); const sum=f=>records.filter(f).reduce((a,r)=>a+r.total,0); todaySales.textContent=sum(r=>r.date===today).toFixed(2); monthSales.textContent=sum(r=>r.date?.slice(0,7)===month).toFixed(2); invoiceCount.textContent=records.length; dieselQty.textContent=records.flatMap(r=>r.items).filter(i=>/diesel/i.test(i.description)).reduce((a,i)=>a+i.qty,0); petrolQty.textContent=records.flatMap(r=>r.items).filter(i=>/petrol/i.test(i.description)).reduce((a,i)=>a+i.qty,0); }
function saveSettings(){ settings.scriptUrl=scriptUrl.value.trim(); localStorage.setItem('settings',JSON.stringify(settings)); alert('Saved'); }
function exportCSV(){ const rows=['Invoice,Date,Customer,Total,Status',...records.map(r=>`${r.invoiceNo},${r.date},${r.customer},${r.total},${r.status}`)]; const blob=new Blob([rows.join('\n')],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='invoice-records.csv'; a.click(); }
