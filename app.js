const DB = "https://googleapis.com";
const SHEET_CSV = "https://google.com";
const ADMIN_USER = "eliezerap98";

const tg = window.Telegram && window.Telegram.WebApp;
if (tg) { tg.ready(); tg.expand(); try { tg.setHeaderColor('#090d16'); tg.setBackgroundColor('#090d16'); } catch(e) {} }
const u = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) ? tg.initDataUnsafe.user : { id: "1001", first_name: "Eliezer", username: "eliezerap98" };
const myId = String(u.id);
const myUser = (u.username || "").toLowerCase();

let rates = { RUB: 98.5, CUP: 320, USDT: 1.0 };
let currentOp = "DEPOSITO";
let myBal = 0;

document.getElementById('uHello').innerText = "@" + (myUser || myId);
document.getElementById('qrImg').src = "https://qrserver.com" + (myUser || myId);
if (myUser === ADMIN_USER) document.getElementById('btnAdminNav').style.display = "block";

async function loadRates() {
  try {
    const r = await fetch(SHEET_CSV);
    const txt = await r.text();
    txt.split('\n').forEach(line => {
      const cols = line.replace(/"/g, '').split(',');
      if (cols.length >= 2) {
        const k = cols.trim().toUpperCase();
        const v = parseFloat(cols.trim());
        if (k && !isNaN(v) && v > 0) rates[k] = v;
      }
    });
  } catch (e) {}
  document.getElementById('ratesBar').innerHTML = Object.entries(rates).map(([k, v]) => `<span class="rate-chip">1 RUSD = ${v} ${k}</span>`).join('');
  updateBalUI();
}

function updateBalUI() {
  document.getElementById('balRusd').innerText = myBal.toFixed(2);
  document.getElementById('balRub').innerText = (myBal * (rates.RUB || 98.5)).toFixed(0);
}

async function initUser() {
  const r = await fetch(`${DB}/wallets/${myId}`);
  if (r.status === 404) {
    await fetch(`${DB}/wallets?documentId=${myId}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: { balance: { doubleValue: 0 }, username: { stringValue: myUser }, name: { stringValue: u.first_name } } })
    });
    myBal = 0;
  } else if (r.ok) {
    const d = await r.json();
    myBal = Number(d.fields.balance?.doubleValue ?? d.fields.balance?.integerValue ?? 0);
    if (d.fields.username?.stringValue !== myUser) {
      await fetch(`${DB}/wallets/${myId}?updateMask.fieldPaths=username`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: { username: { stringValue: myUser } } })
      });
    }
  }
  updateBalUI(); loadHistory(); loadP2P();
  if (myUser === ADMIN_USER) loadAdmin();
}

window.scanQR = function() {
  if (tg && tg.showScanQrPopup) {
    tg.showScanQrPopup({ text: "Escanea el QR de otro usuario" }, (code) => {
      document.getElementById('destUser').value = code;
      tg.closeScanQrPopup(); return true;
    });
  } else { alert("Escáner disponible dentro de la app móvil de Telegram."); }
};

window.sendInternal = async function() {
  const target = document.getElementById('destUser').value.trim().replace('@', '').toLowerCase();
  const amt = parseFloat(document.getElementById('sendAmt').value);
  if (!target || isNaN(amt) || amt <= 0) return alert("Datos inválidos");
  if (amt > myBal) return alert("Saldo insuficiente");
  const btn = document.getElementById('btnSend'); btn.disabled = true; btn.innerText = "Enviando...";
  try {
    const all = await (await fetch(`${DB}/wallets`)).json();
    const destDoc = (all.documents || []).find(doc => doc.name.split('/').pop() === target || (doc.fields.username?.stringValue || "").toLowerCase() === target);
    if (!destDoc) throw new Error("Usuario no registrado en RUSDPAY");
    const destId = destDoc.name.split('/').pop();
    if (destId === myId) throw new Error("No puedes enviarte a ti mismo");
    const destBal = Number(destDoc.fields.balance?.doubleValue ?? destDoc.fields.balance?.integerValue ?? 0);
    await fetch(`${DB}/wallets/${myId}?updateMask.fieldPaths=balance`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: { balance: { doubleValue: myBal - amt } } }) });
    await fetch(`${DB}/wallets/${destId}?updateMask.fieldPaths=balance`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: { balance: { doubleValue: destBal + amt } } }) });
    await fetch(`${DB}/txs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: { from: { stringValue: myUser || myId }, to: { stringValue: target }, amt: { doubleValue: amt }, ts: { integerValue: Date.now() } } }) });
    alert("¡Envío completado!"); document.getElementById('destUser').value = ""; document.getElementById('sendAmt').value = "";
    initUser(); go('home');
  } catch (e) { alert(e.message); }
  btn.disabled = false; btn.innerText = "Enviar Saldo Interno";
};
window.setOp = function(op) {
  currentOp = op;
  document.getElementById('tBuy').className = op === 'DEPOSITO' ? 'tab-btn active' : 'tab-btn';
  document.getElementById('tSell').className = op === 'RETIRO' ? 'tab-btn active' : 'tab-btn';
  calcOp();
};

window.calcOp = function() {
  const amt = parseFloat(document.getElementById('opAmt').value) || 0;
  const curr = document.getElementById('opCurr').value;
  const total = (amt * (rates[curr] || 1)).toFixed(2);
  document.getElementById('opCalc').innerText = `${currentOp === 'DEPOSITO' ? 'Debes transferir' : 'Recibirás'}: ${total} ${curr}`;
};

window.createOrder = async function() {
  const amt = parseFloat(document.getElementById('opAmt').value);
  const curr = document.getElementById('opCurr').value;
  const ref = document.getElementById('opRef').value.trim();
  if (isNaN(amt) || amt <= 0 || !ref) return alert("Completa monto y referencia");
  if (currentOp === 'RETIRO' && amt > myBal) return alert("Saldo insuficiente para retirar");
  await fetch(`${DB}/orders`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { uid: { stringValue: myId }, user: { stringValue: myUser || myId }, type: { stringValue: currentOp }, amt: { doubleValue: amt }, curr: { stringValue: curr }, ref: { stringValue: ref }, status: { stringValue: "PENDIENTE" } } })
  });
  alert("Solicitud enviada. El administrador la revisará pronto.");
  document.getElementById('opAmt').value = ""; document.getElementById('opRef').value = "";
};

async function loadAdmin() {
  const r = await (await fetch(`${DB}/orders`)).json();
  const list = (r.documents || []).filter(d => d.fields.status?.stringValue === "PENDIENTE");
  document.getElementById('adminOrders').innerHTML = list.length ? list.map(d => {
    const oid = d.name.split('/').pop(), f = d.fields;
    return `<div class="item-row"><div><b>${f.type.stringValue}</b> @${f.user.stringValue}<br>${f.amt.doubleValue} RUSD (${f.curr.stringValue}) · Ref: ${f.ref.stringValue}</div><div><button onclick="approve('${oid}','${f.uid.stringValue}','${f.type.stringValue}',${f.amt.doubleValue})" style="background:#10b981;border:none;color:#fff;padding:6px 10px;border-radius:8px;margin-bottom:4px;">✔</button><br><button onclick="reject('${oid}')" style="background:#ef4444;border:none;color:#fff;padding:6px 10px;border-radius:8px;">✖</button></div></div>`;
  }).join('') : '<p style="color:#64748b;font-size:13px;">No hay solicitudes pendientes</p>';
}

window.approve = async function(oid, uid, type, amt) {
  const w = await (await fetch(`${DB}/wallets/${uid}`)).json();
  const curBal = Number(w.fields?.balance?.doubleValue ?? w.fields?.balance?.integerValue ?? 0);
  const newBal = type === 'DEPOSITO' ? curBal + amt : Math.max(0, curBal - amt);
  await fetch(`${DB}/wallets/${uid}?updateMask.fieldPaths=balance`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: { balance: { doubleValue: newBal } } }) });
  await fetch(`${DB}/orders/${oid}?updateMask.fieldPaths=status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: { status: { stringValue: "APROBADO" } } }) });
  alert("Operación aprobada"); initUser();
};

window.reject = async function(oid) {
  await fetch(`${DB}/orders/${oid}?updateMask.fieldPaths=status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: { status: { stringValue: "RECHAZADO" } } }) });
  loadAdmin();
};

window.postP2P = async function() {
  const type = document.getElementById('p2pType').value, asset = document.getElementById('p2pAsset').value;
  const amt = document.getElementById('p2pAmt').value, price = document.getElementById('p2pPrice').value;
  if (!amt || !price) return alert("Completa monto y tasa");
  await fetch(`${DB}/p2p`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: { user: { stringValue: myUser || myId }, type: { stringValue: type }, asset: { stringValue: asset }, amt: { stringValue: amt }, price: { stringValue: price } } }) });
  alert("Anuncio P2P publicado"); loadP2P();
};

async function loadP2P() {
  const r = await (await fetch(`${DB}/p2p`)).json();
  document.getElementById('p2pList').innerHTML = (r.documents || []).map(d => {
    const f = d.fields;
    return `<div class="item-row"><div><b>${f.type.stringValue}</b> (${f.asset.stringValue})<br><small>@${f.user.stringValue} · Cant: ${f.amt.stringValue} · Tasa: ${f.price.stringValue} RUB</small></div><a href="https://t.me{f.user.stringValue}" target="_blank" style="background:#2563eb;color:#fff;padding:6px 12px;border-radius:8px;text-decoration:none;font-weight:bold;">Chat</a></div>`;
  }).join('') || '<p style="color:#64748b;font-size:13px;">Sin anuncios P2P aún</p>';
}

async function loadHistory() {
  const r = await (await fetch(`${DB}/txs`)).json();
  const mine = (r.documents || []).filter(d => d.fields.from?.stringValue === (myUser || myId) || d.fields.to?.stringValue === (myUser || myId));
  document.getElementById('txList').innerHTML = mine.slice(0, 6).map(d => {
    const f = d.fields, isOut = f.from.stringValue === (myUser || myId);
    return `<div class="item-row"><span>${isOut ? 'Enviado a @' + f.to.stringValue : 'Recibido de @' + f.from.stringValue}</span><b style="color:${isOut ? '#ef4444' : '#10b981'}">${isOut ? '-' : '+'}${f.amt.doubleValue} RUSD</b></div>`;
  }).join('') || '<p style="color:#64748b;font-size:13px;">Sin movimientos aún</p>';
}

window.copyMe = function() { navigator.clipboard.writeText(myUser ? '@' + myUser : myId); alert("Copiado"); };
window.go = function(v) {
  ['home','send','rec','p2p','admin'].forEach(x => {
    const el = document.getElementById('v-' + x), nv = document.getElementById('n-' + x);
    if (el) el.className = x === v ? 'view show' : 'view';
    if (nv) nv.className = x === v ? 'nav-item active' : 'nav-item';
  });
};

loadRates();
initUser();
