// =========================================================
// TURBINE BRASIL — Cloud Functions
// -----------------------------------------------------------
// Resolve, no servidor, os itens do relatório de auditoria que o
// Firestore.rules sozinho não conseguia resolver por completo:
//
//  - 2.2 / 5.1 (CRÍTICO): preço/quantidade do pedido calculados
//    aqui, a partir de functions/catalog.js — o valor que o
//    navegador manda é IGNORADO.
//  - 2.3 (ALTO): a API key do CallMeBot sai do HTML e vira um
//    "secret" do lado do servidor, nunca mais exposto ao público.
//  - 2.10 (MÉDIO): toda ação administrativa grava quem fez o quê
//    em audit_logs, incluindo cancelamentos (que antes não eram
//    registrados).
//
// Instale as dependências e publique com:
//   cd functions && npm install
//   firebase deploy --only functions,firestore:rules
// =========================================================
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
 
const { catalog } = require("./catalog");
const { buildPixPayload } = require("./pix");
 
admin.initializeApp();
const db = admin.firestore();
 
// ---------------------------------------------------------
// CONFIGURAÇÃO
// ---------------------------------------------------------
// Troque pelo mesmo e-mail usado em APP_CONFIG.adminEmail (index.html)
// e em firestore.rules. Idealmente, migre para custom claim (ver
// scripts/setAdminClaim.js) e troque este e-mail fixo por
// `request.auth.token.admin === true`.
const ADMIN_EMAIL = "piiterthor@gmail.com";
 
const PIX_CONFIG = {
  key: "+5511997694937", // mesma chave Pix do APP_CONFIG.pix.key em index.html
  merchantName: "TURBINE BRASIL",
  merchantCity: "BELO HORIZONTE",
};
 
const DEPOSIT_MIN = 1;
const DEPOSIT_MAX = 5000;
 
// Secrets do CallMeBot — NUNCA ficam no código nem no HTML. Configure com:
//   firebase functions:secrets:set CALLMEBOT_PHONE
//   firebase functions:secrets:set CALLMEBOT_APIKEY
const CALLMEBOT_PHONE = defineSecret("CALLMEBOT_PHONE");
const CALLMEBOT_APIKEY = defineSecret("CALLMEBOT_APIKEY");
 
function money(v) {
  return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
 
function isAdminRequest(request) {
  const email = request.auth && request.auth.token && request.auth.token.email;
  return !!email && email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}
 
function requireAuth(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Você precisa estar logado.");
  }
}
 
async function sendWhatsapp(message, secrets) {
  try {
    const phone = secrets.phone.value();
    const apikey = secrets.apikey.value();
    if (!phone || !apikey) {
      logger.warn("CallMeBot não configurado (secrets ausentes) — notificação ignorada.");
      return;
    }
    const url =
      "https://api.callmebot.com/whatsapp.php?phone=" +
      encodeURIComponent(phone) +
      "&text=" +
      encodeURIComponent(message) +
      "&apikey=" +
      encodeURIComponent(apikey);
    const res = await fetch(url);
    if (!res.ok) {
      logger.warn("Falha ao notificar WhatsApp:", res.status, await res.text());
    }
  } catch (e) {
    logger.warn("Erro ao notificar WhatsApp:", e);
  }
}
 
function commentsForWhatsapp(comments) {
  if (!comments || !comments.length) return "";
  return "\n📝 Comentários para postar:\n" + comments.map((c, i) => `${i + 1}. ${c}`).join("\n");
}
 
async function writeAuditLog(entry) {
  try {
    await db.collection("audit_logs").add({
      ...entry,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    logger.warn("Não foi possível gravar audit_log:", e);
  }
}
 
// ---------------------------------------------------------
// createOrder — substitui o db.collection('orders').add(...) que
// hoje é feito DIRETO pelo navegador em index.html. O cliente manda
// só platform/groupKey/tierIndex/link/comments; o preço vem
// exclusivamente de catalog.js.
// ---------------------------------------------------------
exports.createOrder = onCall({ secrets: [CALLMEBOT_PHONE, CALLMEBOT_APIKEY] }, async (request) => {
  requireAuth(request);
  const { platform, groupKey, tierIndex, link, comments, useBalance } = request.data || {};
 
  if (typeof link !== "string" || !link.trim()) {
    throw new HttpsError("invalid-argument", "Informe o link ou @ do perfil.");
  }
  const data = catalog[platform];
  const group = data && data.groups[groupKey];
  const tier = group && group.tiers[Number(tierIndex)];
  if (!data || !group || !tier) {
    throw new HttpsError("invalid-argument", "Pacote inválido ou desatualizado. Atualize a página e tente de novo.");
  }
 
  let cleanComments = [];
  if (group.commentsInput) {
    cleanComments = Array.isArray(comments)
      ? comments.map((c) => String(c).trim()).filter(Boolean).slice(0, 200)
      : [];
    if (!cleanComments.length) {
      throw new HttpsError("invalid-argument", "Informe os comentários que devem ser postados.");
    }
  }
 
  const amount = Number(tier.price.toFixed(2)); // <-- único lugar que decide o preço
  const quantityLabel = tier.bonusQty
    ? `${tier.qty} (+300% bônus = ${tier.bonusQty} entregues)`
    : String(tier.qty);
  const serviceLabel = `${quantityLabel} ${group.label}`;
 
  const baseOrder = {
    userId: request.auth.uid,
    userName: request.auth.token.name || "",
    userEmail: request.auth.token.email || "",
    service: serviceLabel,
    platform: data.label,
    quantity: tier.qty,
    link: link.trim().slice(0, 500),
    amount,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (cleanComments.length) baseOrder.comments = cleanComments;
 
  let orderId;
  let balanceUsed = 0;
  let remaining = amount;
  let status = "pending_payment";
 
  if (useBalance) {
    // Usado só pelo painel "Novo Pedido" (submitOrder em index.html):
    // desconta do saldo do cliente o quanto der e só cobra a diferença
    // (se houver) via Pix. Roda em transação para nunca deixar o saldo
    // negativo nem descontar duas vezes em caso de cliques repetidos.
    const orderRef = db.collection("orders").doc();
    const userRef = db.collection("users").doc(request.auth.uid);
    await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef); // leitura sempre antes de qualquer escrita
      const balance = Number((userSnap.data() || {}).balance || 0);
      balanceUsed = Number(Math.min(Math.max(balance, 0), amount).toFixed(2));
      remaining = Number(Math.max(0, amount - balanceUsed).toFixed(2));
      status = remaining > 0 ? "pending_payment" : "paid";
 
      const orderData = {
        ...baseOrder,
        balanceUsed,
        remainingAmount: remaining,
        paidVia: remaining === 0 ? "balance" : balanceUsed > 0 ? "balance+pix" : "pix",
        status,
      };
      if (remaining === 0) {
        orderData.paymentConfirmedAt = admin.firestore.FieldValue.serverTimestamp();
      }
      tx.set(orderRef, orderData);
      if (balanceUsed > 0) {
        tx.update(userRef, {
          balance: admin.firestore.FieldValue.increment(-balanceUsed),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    });
    orderId = orderRef.id;
  } else {
    const ref = await db.collection("orders").add({ ...baseOrder, status: "pending_payment" });
    orderId = ref.id;
  }
 
  let payload = null;
  if (remaining > 0) {
    payload = buildPixPayload(
      remaining, // só o restante depois do saldo usado — nunca o valor cheio de novo
      PIX_CONFIG.key,
      PIX_CONFIG.merchantName,
      PIX_CONFIG.merchantCity,
      "PED" + orderId.slice(0, 20),
    );
    await db.collection("orders").doc(orderId).update({ pixPayload: payload, pixKey: PIX_CONFIG.key });
  }
 
  const statusLine =
    remaining === 0
      ? `Status: PAGO com saldo (${money(balanceUsed)})`
      : balanceUsed > 0
        ? `Status: aguardando pagamento do restante (${money(balanceUsed)} já descontado do saldo)`
        : "Status: aguardando pagamento";
 
  await sendWhatsapp(
    "🛒 Novo pedido — Turbine Brasil\n" +
      `Cliente: ${baseOrder.userName} (${baseOrder.userEmail})\n` +
      `Serviço: ${baseOrder.service} — ${baseOrder.platform}\n` +
      `Valor total: ${money(amount)}\n` +
      `Link: ${baseOrder.link}\n` +
      statusLine +
      commentsForWhatsapp(cleanComments),
    { phone: CALLMEBOT_PHONE, apikey: CALLMEBOT_APIKEY },
  );
 
  return { orderId, amount, balanceUsed, remainingAmount: remaining, pixPayload: payload, status };
});
 
// ---------------------------------------------------------
// createDeposit — não depende de catálogo (o cliente escolhe o
// valor de propósito), mas ainda assim valida faixa no servidor
// em vez de confiar só no atributo min/max do <input> HTML.
// ---------------------------------------------------------
exports.createDeposit = onCall({ secrets: [CALLMEBOT_PHONE, CALLMEBOT_APIKEY] }, async (request) => {
  requireAuth(request);
  const amount = Number((request.data || {}).amount);
  if (!Number.isFinite(amount) || amount < DEPOSIT_MIN || amount > DEPOSIT_MAX) {
    throw new HttpsError("invalid-argument", `Informe um valor entre ${money(DEPOSIT_MIN)} e ${money(DEPOSIT_MAX)}.`);
  }
  const roundedAmount = Number(amount.toFixed(2));
 
  const deposit = {
    userId: request.auth.uid,
    userName: request.auth.token.name || "",
    userEmail: request.auth.token.email || "",
    amount: roundedAmount,
    status: "pending_payment",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const ref = await db.collection("deposits").add(deposit);
  const payload = buildPixPayload(
    roundedAmount,
    PIX_CONFIG.key,
    PIX_CONFIG.merchantName,
    PIX_CONFIG.merchantCity,
    "DEP" + ref.id.slice(0, 20),
  );
  await ref.update({ pixPayload: payload, pixKey: PIX_CONFIG.key });
 
  await sendWhatsapp(
    "💵 Novo depósito — Turbine Brasil\n" +
      `Cliente: ${deposit.userName} (${deposit.userEmail})\n` +
      `Valor: ${money(deposit.amount)}\n` +
      "Status: aguardando pagamento",
    { phone: CALLMEBOT_PHONE, apikey: CALLMEBOT_APIKEY },
  );
 
  return { depositId: ref.id, amount: roundedAmount, pixPayload: payload };
});
 
// ---------------------------------------------------------
// confirmDepositPayment — move a transação de crédito de saldo
// (que hoje o admin dispara pelo navegador) para o servidor.
// Continua igualmente protegida pelas regras do Firestore, mas
// centralizar aqui facilita auditar e, futuramente, plugar outra
// forma de confirmação (ex.: webhook do banco) sem mexer no front.
// ---------------------------------------------------------
exports.confirmDepositPayment = onCall(async (request) => {
  requireAuth(request);
  if (!isAdminRequest(request)) {
    throw new HttpsError("permission-denied", "Ação restrita ao proprietário.");
  }
  const depositId = (request.data || {}).depositId;
  if (!depositId) throw new HttpsError("invalid-argument", "depositId é obrigatório.");
 
  await db.runTransaction(async (tx) => {
    const depRef = db.collection("deposits").doc(depositId);
    const depSnap = await tx.get(depRef);
    const dep = depSnap.data();
    if (!dep) throw new HttpsError("not-found", "Depósito não encontrado.");
    if (dep.status === "paid") return; // idempotente — evita crédito duplicado.
 
    const userRef = db.collection("users").doc(dep.userId);
    const userSnap = await tx.get(userRef);
    const balance = Number((userSnap.data() || {}).balance || 0);
 
    tx.update(userRef, {
      balance: balance + Number(dep.amount || 0),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    tx.update(depRef, {
      status: "paid",
      paymentConfirmedAt: admin.firestore.FieldValue.serverTimestamp(),
      confirmedBy: request.auth.token.email,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
 
  await writeAuditLog({
    action: "confirm_deposit",
    depositId,
    performedBy: request.auth.token.email,
  });
 
  return { ok: true };
});
 
// ---------------------------------------------------------
// confirmOrderPayment / setOrderStatus — mesma lógica que já existia
// no navegador (confirmOrderPayment/setOrderStatus em index.html),
// só que agora com trilha de auditoria em audit_logs (o Firestore.rules
// já protegia essas escritas com isAdmin(), então isto é sobretudo
// para ganhar o registro de "quem fez o quê e quando").
// ---------------------------------------------------------
exports.confirmOrderPayment = onCall(async (request) => {
  requireAuth(request);
  if (!isAdminRequest(request)) {
    throw new HttpsError("permission-denied", "Ação restrita ao proprietário.");
  }
  const orderId = (request.data || {}).orderId;
  if (!orderId) throw new HttpsError("invalid-argument", "orderId é obrigatório.");
 
  await db.collection("orders").doc(orderId).set(
    {
      status: "paid",
      paymentConfirmedAt: admin.firestore.FieldValue.serverTimestamp(),
      confirmedBy: request.auth.token.email,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await writeAuditLog({ action: "confirm_order", orderId, performedBy: request.auth.token.email });
  return { ok: true };
});
 
const ALLOWED_MANUAL_STATUSES = ["processing", "completed"];
exports.setOrderStatus = onCall(async (request) => {
  requireAuth(request);
  if (!isAdminRequest(request)) {
    throw new HttpsError("permission-denied", "Ação restrita ao proprietário.");
  }
  const { orderId, status } = request.data || {};
  if (!orderId || !ALLOWED_MANUAL_STATUSES.includes(status)) {
    throw new HttpsError("invalid-argument", "orderId/status inválidos.");
  }
  await db.collection("orders").doc(orderId).set(
    { status, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true },
  );
  await writeAuditLog({ action: "set_order_status", orderId, status, performedBy: request.auth.token.email });
  return { ok: true };
});
 
// ---------------------------------------------------------
// cancelOrder / cancelDeposit — versões com trilha de auditoria
// completa (achado 2.10: hoje cancelOrder/cancelDeposit em
// index.html não gravam quem cancelou).
// ---------------------------------------------------------
exports.cancelOrder = onCall(async (request) => {
  requireAuth(request);
  if (!isAdminRequest(request)) {
    throw new HttpsError("permission-denied", "Ação restrita ao proprietário.");
  }
  const orderId = (request.data || {}).orderId;
  if (!orderId) throw new HttpsError("invalid-argument", "orderId é obrigatório.");
 
  let refundAmount = 0;
  await db.runTransaction(async (tx) => {
    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await tx.get(orderRef); // leitura sempre antes de qualquer escrita
    const order = orderSnap.data();
    if (!order) throw new HttpsError("not-found", "Pedido não encontrado.");
    if (order.status === "cancelled") return; // idempotente — evita estornar duas vezes.
 
    // Se parte (ou tudo) desse pedido tinha sido pago com saldo do
    // cliente (achado: pedido pago via painel "Novo Pedido"), devolve
    // esse valor para o saldo dele ao recusar — senão o dinheiro fica
    // "preso" descontado sem o pedido ter sido entregue.
    refundAmount = Number(order.balanceUsed || 0);
    if (refundAmount > 0) {
      const userRef = db.collection("users").doc(order.userId);
      tx.update(userRef, {
        balance: admin.firestore.FieldValue.increment(refundAmount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    tx.update(orderRef, {
      status: "cancelled",
      cancelledBy: request.auth.token.email,
      cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(refundAmount > 0 ? { balanceRefunded: true, balanceRefundedAmount: refundAmount } : {}),
    });
  });
  await writeAuditLog({
    action: "cancel_order",
    orderId,
    performedBy: request.auth.token.email,
    ...(refundAmount > 0 ? { balanceRefunded: refundAmount } : {}),
  });
  return { ok: true, refundAmount };
});
 
exports.cancelDeposit = onCall(async (request) => {
  requireAuth(request);
  if (!isAdminRequest(request)) {
    throw new HttpsError("permission-denied", "Ação restrita ao proprietário.");
  }
  const depositId = (request.data || {}).depositId;
  if (!depositId) throw new HttpsError("invalid-argument", "depositId é obrigatório.");
 
  await db.collection("deposits").doc(depositId).set(
    {
      status: "cancelled",
      cancelledBy: request.auth.token.email,
      cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await writeAuditLog({ action: "cancel_deposit", depositId, performedBy: request.auth.token.email });
  return { ok: true };
});
 
// ---------------------------------------------------------
// Gatilhos automáticos: avisam o proprietário quando o cliente
// sinaliza "já paguei" — substitui as chamadas client-side a
// notifyOwnerWhatsapp() que existiam em markCurrentOrderPaidByCustomer()
// e reportDepositPaid() no index.html (que dependiam da API key
// exposta no HTML).
// ---------------------------------------------------------
exports.onOrderUpdated = onDocumentUpdated(
  { document: "orders/{orderId}", secrets: [CALLMEBOT_PHONE, CALLMEBOT_APIKEY] },
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (before.status !== "payment_reported" && after.status === "payment_reported") {
      await sendWhatsapp(
        "💰 Cliente informou pagamento — Turbine Brasil\n" +
          `Pedido #${event.params.orderId}\n` +
          "Confira o Pix recebido e confirme no Painel do proprietário.",
        { phone: CALLMEBOT_PHONE, apikey: CALLMEBOT_APIKEY },
      );
    }
  },
);
 
exports.onDepositUpdated = onDocumentUpdated(
  { document: "deposits/{depositId}", secrets: [CALLMEBOT_PHONE, CALLMEBOT_APIKEY] },
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (before.status !== "payment_reported" && after.status === "payment_reported") {
      await sendWhatsapp(
        "💰 Cliente informou pagamento de depósito — Turbine Brasil\n" +
          `Depósito #${event.params.depositId}\n` +
          "Confira o Pix recebido e confirme no Painel do proprietário.",
        { phone: CALLMEBOT_PHONE, apikey: CALLMEBOT_APIKEY },
      );
    }
  },
);