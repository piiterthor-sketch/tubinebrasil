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
const nodemailer = require("nodemailer");

const { catalog } = require("./catalog");
const { buildPixPayload } = require("./pix");
const baratoApi = require("./baratoApi");
const { getExternalServiceId } = require("./externalServiceMap");

admin.initializeApp();
const db = admin.firestore();

// ---------------------------------------------------------
// CONFIGURAÇÃO
// ---------------------------------------------------------
// Lista de e-mails Google com acesso de administrador (dono + sócios de
// confiança). Precisa ficar IDÊNTICA à lista adminEmails em
// APP_CONFIG (index.html) e à lista dentro de isAdmin() em
// firestore.rules — os três lugares fazem a mesma checagem,
// independentemente uns dos outros. Pra adicionar/remover alguém, edite
// os três e publique de novo (functions + firestore:rules + index.html).
// Idealmente, migre para custom claim (ver scripts/setAdminClaim.js) e
// troque essa lista fixa por `request.auth.token.admin === true`.
const ADMIN_EMAILS = ["piiterthor@gmail.com", "marketing.turbinebrasil@gmail.com"];

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

// Secret da baratosociais.com (fornecedor de SMM) — NUNCA fica no código
// nem no HTML. Configure com:
//   firebase functions:secrets:set BARATOSOCIAIS_API_KEY
const BARATOSOCIAIS_API_KEY = defineSecret("BARATOSOCIAIS_API_KEY");

// ---------------------------------------------------------
// Notificação por e-mail (pedido de 25/08/2026: "cada pedido que chegar
// pra nós no site, chegar no email também"). Usa a própria conta Gmail
// como remetente, via "senha de app" (NUNCA a senha normal da conta —
// isso é uma senha de 16 dígitos gerada só pra isso, revogável a
// qualquer momento sem afetar o login normal). Configure com:
//   firebase functions:secrets:set GMAIL_APP_PASSWORD
// Só o proprietário (piiterthor@gmail.com) recebe esses e-mails por
// enquanto — se quiser incluir mais gente, é só adicionar o e-mail em
// NOTIFY_EMAIL_TO abaixo (separado por vírgula) e reimplantar.
const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");
const GMAIL_SENDER = "piiterthor@gmail.com";
const NOTIFY_EMAIL_TO = "piiterthor@gmail.com";

function nowBR() {
  return new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

async function sendEmail(subject, text, secret) {
  try {
    const pass = secret.value();
    if (!pass) {
      logger.warn("Gmail não configurado (secret GMAIL_APP_PASSWORD ausente) — e-mail pulado.");
      return;
    }
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: GMAIL_SENDER, pass },
    });
    await transporter.sendMail({
      from: `"Turbine Brasil" <${GMAIL_SENDER}>`,
      to: NOTIFY_EMAIL_TO,
      subject,
      text,
    });
  } catch (e) {
    logger.warn("Erro ao enviar e-mail de notificação:", e);
  }
}

function money(v) {
  return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function isAdminRequest(request) {
  const email = request.auth && request.auth.token && request.auth.token.email;
  return !!email && ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(email.toLowerCase());
}

function requireAuth(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Você precisa estar logado.");
  }
}

// ---------------------------------------------------------
// checkRateLimit — trava simples de "não mais que N chamadas por
// minuto, por usuário, por função" (auditoria de segurança item 11).
// Guarda o contador dentro do Firestore, na coleção rate_limits/{uid}
// (invisível pro cliente: não existe regra liberando leitura/escrita
// nela em firestore.rules, então só a própria Cloud Function, que usa
// o Admin SDK e ignora as regras, consegue tocar nesse documento).
// Roda em transação pra não deixar passar 2 chamadas simultâneas
// "furando" o limite (ex.: duplo clique disparando 2 requisições ao
// mesmo tempo antes da 1ª contagem ser salva).
// ---------------------------------------------------------
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // janela de 1 minuto
const RATE_LIMIT_MAX = { createOrder: 6, createDeposit: 6 }; // no máx. 6 pedidos/depósitos por minuto por usuário

async function checkRateLimit(uid, kind) {
  const max = RATE_LIMIT_MAX[kind] || 10;
  const ref = db.collection("rate_limits").doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref); // leitura sempre antes de qualquer escrita
    const data = snap.data() || {};
    const entry = data[kind] || { count: 0, windowStart: 0 };
    const now = Date.now();
    let { count, windowStart } = entry;
    if (!windowStart || now - windowStart > RATE_LIMIT_WINDOW_MS) {
      count = 0;
      windowStart = now;
    }
    count += 1;
    if (count > max) {
      throw new HttpsError(
        "resource-exhausted",
        "Muitas tentativas em pouco tempo. Aguarde um minuto e tente de novo.",
      );
    }
    tx.set(ref, { [kind]: { count, windowStart } }, { merge: true });
  });
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

// ---------------------------------------------------------
// sendOrderToProvider — envia um pedido já PAGO pro fornecedor
// (baratosociais.com), que é quem de fato entrega seguidores/curtidas/
// etc. Só funciona para pacotes que já têm o ID de serviço do
// fornecedor configurado em externalServiceMap.js — se não tiver
// mapeamento ainda, não é erro: o pedido continua válido no Turbine
// Brasil, só fica sem envio automático (dá pra mandar manualmente
// depois, pelo botão "Enviar para fornecedor" no painel admin).
// Nunca lança exceção pra fora — uma falha aqui não pode derrubar a
// confirmação de pagamento nem o pedido já pago do cliente.
// ---------------------------------------------------------
async function sendOrderToProvider(orderId, order, apiKeySecret) {
  try {
    const apiKey = apiKeySecret.value();
    if (!apiKey) {
      logger.warn("baratosociais.com não configurada (secret ausente) — envio pulado.", { orderId });
      return { sent: false, reason: "sem_api_key" };
    }
    const serviceId = getExternalServiceId(
      order.providerPlatform,
      order.providerGroupKey,
      order.providerTierIndex,
    );
    if (!serviceId) {
      logger.info("Pacote sem mapeamento de fornecedor — envio automático pulado.", {
        orderId,
        providerPlatform: order.providerPlatform,
        providerGroupKey: order.providerGroupKey,
        providerTierIndex: order.providerTierIndex,
      });
      return { sent: false, reason: "sem_mapeamento" };
    }
    const payload = {
      service: serviceId,
      link: order.link,
      quantity: order.deliverQty || order.quantity,
    };
    if (order.comments && order.comments.length) {
      payload.comments = order.comments.join("\n");
      delete payload.quantity; // pedidos de comentário usam a lista, não quantidade
    }
    const result = await baratoApi.order(apiKey, payload);
    if (!result || result.order == null) {
      throw new Error("Resposta do fornecedor não trouxe o ID do pedido.");
    }
    await db.collection("orders").doc(orderId).set(
      {
        externalOrderId: String(result.order),
        externalServiceId: serviceId,
        externalStatus: "Pending",
        providerError: admin.firestore.FieldValue.delete(),
        sentToProviderAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return { sent: true, externalOrderId: String(result.order) };
  } catch (e) {
    logger.warn("Falha ao enviar pedido pro fornecedor:", orderId, e.message || e);
    await db
      .collection("orders")
      .doc(orderId)
      .set(
        { providerError: String((e && e.message) || e), updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      )
      .catch(() => {});
    return { sent: false, reason: "erro", error: String((e && e.message) || e) };
  }
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
exports.createOrder = onCall({ secrets: [CALLMEBOT_PHONE, CALLMEBOT_APIKEY, BARATOSOCIAIS_API_KEY, GMAIL_APP_PASSWORD] }, async (request) => {
  requireAuth(request);
  await checkRateLimit(request.auth.uid, "createOrder");
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
    // .slice(0, 500) em cada comentário individual: antes só limitava a
    // QUANTIDADE de comentários (200), não o tamanho de cada um — um
    // comentário gigante (ex.: milhares de caracteres colados) inflava o
    // documento no Firestore e a mensagem do WhatsApp à toa (auditoria de
    // segurança item 14 — validação de inputs).
    cleanComments = Array.isArray(comments)
      ? comments.map((c) => String(c).trim().slice(0, 500)).filter(Boolean).slice(0, 200)
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
    // Guardado separado do "platform"/"service" (que são só texto pra
    // exibir na tela) — são as chaves cruas do catalog.js, usadas depois
    // pra descobrir automaticamente o serviço correspondente lá na
    // baratosociais.com (ver externalServiceMap.js / sendOrderToProvider).
    providerPlatform: platform,
    providerGroupKey: groupKey,
    providerTierIndex: Number(tierIndex),
    // Quantidade real a entregar: quando o pacote tem bônus (ex.: "+300%
    // bônus = 4000 entregues"), é o bonusQty que deve ir pro fornecedor,
    // não o "quantity" de exibição.
    deliverQty: tier.bonusQty || tier.qty,
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
        // Arredondado pra 2 casas (mesmo motivo do comentário em
        // confirmDepositPayment) — evita "sujeira" de ponto flutuante se
        // acumular no saldo a cada pedido pago com saldo.
        const newBalance = Number(Math.max(0, balance - balanceUsed).toFixed(2));
        tx.update(userRef, {
          balance: newBalance,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    });
    orderId = orderRef.id;
    if (status === "paid") {
      // Saldo cobriu o pedido inteiro — já está pago, então já manda pro
      // fornecedor automaticamente (fora da transação: chamada HTTP não
      // deve rodar dentro de db.runTransaction). Se der erro ou faltar
      // mapeamento, sendOrderToProvider só registra e não interrompe o
      // pedido, que continua válido e pago pro cliente.
      await sendOrderToProvider(orderId, baseOrder, BARATOSOCIAIS_API_KEY);
    }
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
  await sendEmail(
    `🛒 Novo pedido — ${baseOrder.userName || baseOrder.userEmail}`,
    "Novo pedido recebido no Turbine Brasil\n\n" +
      `Cliente: ${baseOrder.userName}\n` +
      `E-mail do cliente: ${baseOrder.userEmail}\n` +
      `Tipo de pedido: ${baseOrder.service}\n` +
      `Plataforma: ${baseOrder.platform}\n` +
      `Valor total: ${money(amount)}\n` +
      `Link/perfil: ${baseOrder.link}\n` +
      `Data: ${nowBR()}\n` +
      statusLine +
      commentsForWhatsapp(cleanComments) +
      `\n\nID do pedido: ${orderId}`,
    GMAIL_APP_PASSWORD,
  );

  return { orderId, amount, balanceUsed, remainingAmount: remaining, pixPayload: payload, status };
});

// ---------------------------------------------------------
// createDeposit — não depende de catálogo (o cliente escolhe o
// valor de propósito), mas ainda assim valida faixa no servidor
// em vez de confiar só no atributo min/max do <input> HTML.
// ---------------------------------------------------------
exports.createDeposit = onCall({ secrets: [CALLMEBOT_PHONE, CALLMEBOT_APIKEY, GMAIL_APP_PASSWORD] }, async (request) => {
  requireAuth(request);
  await checkRateLimit(request.auth.uid, "createDeposit");
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
  await sendEmail(
    `💵 Novo depósito — ${deposit.userName || deposit.userEmail}`,
    "Novo depósito recebido no Turbine Brasil\n\n" +
      `Cliente: ${deposit.userName}\n` +
      `E-mail do cliente: ${deposit.userEmail}\n` +
      `Valor: ${money(deposit.amount)}\n` +
      `Data: ${nowBR()}\n` +
      "Status: aguardando pagamento\n" +
      `\nID do depósito: ${ref.id}`,
    GMAIL_APP_PASSWORD,
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
    const userSnap = await tx.get(userRef); // leitura sempre antes de qualquer escrita
    const currentBalance = Number((userSnap.data() || {}).balance || 0);
    // Arredonda pra 2 casas a cada crédito — sem isso, somas repetidas de
    // valores como 12,99/0,10 acumulam "sujeira" de ponto flutuante (ex.:
    // 0.00000000000002 em vez de 0 exato) que, embora não apareça na tela
    // (a formatação de moeda já arredonda), fica gravada suja no banco.
    // set(...,{merge:true}) em vez de update() também cria o documento
    // sozinho se por acaso ele ainda não existisse (ex: ensureUserDocument
    // não rodou a tempo) — antes isso fazia tx.update() falhar e o
    // crédito se perder em silêncio (achado do dia 22/08/2026).
    const newBalance = Number((currentBalance + Number(dep.amount || 0)).toFixed(2));
    tx.set(
      userRef,
      {
        balance: newBalance,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
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
// Antes de confirmar, checa se o saldo lá na baratosociais.com cobre o
// valor do pedido — pedido do cliente (22/08/2026): "caso eu não tenha
// saldo, favor não deixar confirmar". Compara contra o VALOR COBRADO DO
// CLIENTE (não o preço de custo, que é menor) — ou seja, é uma checagem
// conservadora: se passar nela, sobra margem de sobra pra comprar de
// verdade lá no fornecedor. Só bloqueia quando dá pra consultar o saldo
// (API key configurada e fornecedor respondendo); se a key não estiver
// configurada ainda, ou a consulta falhar, deixa confirmar mesmo assim
// (pra não travar o negócio todo por causa de uma integração externa
// instável) — só registra um aviso no log.
async function checkSupplierBalanceCovers(amount) {
  const apiKey = BARATOSOCIAIS_API_KEY.value();
  if (!apiKey) return; // integração ainda não configurada — não bloqueia.
  let result;
  try {
    result = await baratoApi.balance(apiKey);
  } catch (e) {
    logger.warn("Não foi possível consultar saldo do fornecedor antes de confirmar:", e.message || e);
    return; // fornecedor fora do ar / erro de rede — não bloqueia o admin.
  }
  const supplierBalance = Number(result && result.balance);
  if (!Number.isFinite(supplierBalance)) return; // resposta inesperada — não bloqueia.
  if (supplierBalance < amount) {
    throw new HttpsError(
      "failed-precondition",
      `Saldo insuficiente no fornecedor (baratosociais.com) para cobrir este pedido: você tem ${money(supplierBalance)}, o pedido é de ${money(amount)}. Adicione saldo lá antes de confirmar.`,
    );
  }
}

exports.confirmOrderPayment = onCall({ secrets: [BARATOSOCIAIS_API_KEY] }, async (request) => {
  requireAuth(request);
  if (!isAdminRequest(request)) {
    throw new HttpsError("permission-denied", "Ação restrita ao proprietário.");
  }
  const orderId = (request.data || {}).orderId;
  if (!orderId) throw new HttpsError("invalid-argument", "orderId é obrigatório.");

  const orderBeforeSnap = await db.collection("orders").doc(orderId).get();
  const orderBefore = orderBeforeSnap.data();
  if (!orderBefore) throw new HttpsError("not-found", "Pedido não encontrado.");
  await checkSupplierBalanceCovers(Number(orderBefore.amount || 0));

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

  // Pagamento confirmado -> já manda pro fornecedor (baratosociais.com)
  // automaticamente, se o pacote já tiver mapeamento configurado.
  const orderSnap = await db.collection("orders").doc(orderId).get();
  const orderData = orderSnap.data();
  let providerResult = { sent: false, reason: "sem_dados" };
  if (orderData) {
    providerResult = await sendOrderToProvider(orderId, orderData, BARATOSOCIAIS_API_KEY);
  }
  return { ok: true, providerResult };
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
      const userSnap = await tx.get(userRef); // leitura sempre antes de qualquer escrita
      const currentBalance = Number((userSnap.data() || {}).balance || 0);
      // Arredondado pra 2 casas — mesmo motivo do comentário em
      // confirmDepositPayment (evita sujeira de ponto flutuante no saldo).
      const newBalance = Number((currentBalance + refundAmount).toFixed(2));
      tx.set(
        userRef,
        {
          balance: newBalance,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
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
// Integração com o fornecedor (baratosociais.com) — todas as funções
// abaixo são exclusivas do proprietário (isAdminRequest). O envio
// automático do pedido já acontece sozinho em createOrder (quando o
// saldo cobre tudo) e em confirmOrderPayment (quando o Pix é
// confirmado); estas aqui são as ferramentas manuais do painel admin
// para configurar o mapeamento de serviços e agir quando o envio
// automático não rolar (ex.: pacote ainda sem mapeamento, ou erro
// temporário do fornecedor).
// ---------------------------------------------------------

// Lista os serviços/preços da baratosociais.com — usado só pra você
// descobrir o ID de cada serviço deles e preencher externalServiceMap.js.
// Aceita um "search" opcional (nome do serviço) pra não precisar rolar
// uma lista gigante toda vez.
exports.adminFetchExternalServices = onCall({ secrets: [BARATOSOCIAIS_API_KEY] }, async (request) => {
  requireAuth(request);
  if (!isAdminRequest(request)) {
    throw new HttpsError("permission-denied", "Ação restrita ao proprietário.");
  }
  const apiKey = BARATOSOCIAIS_API_KEY.value();
  if (!apiKey) {
    throw new HttpsError("failed-precondition", "Configure o secret BARATOSOCIAIS_API_KEY antes de usar isto.");
  }
  const search = String((request.data || {}).search || "").trim().toLowerCase();
  let list = await baratoApi.services(apiKey);
  if (!Array.isArray(list)) {
    throw new HttpsError("internal", "Resposta inesperada da baratosociais.com ao listar serviços.");
  }
  if (search) {
    list = list.filter(
      (s) =>
        String(s.name || "").toLowerCase().includes(search) ||
        String(s.category || "").toLowerCase().includes(search) ||
        String(s.service) === search,
    );
  }
  // Corta em 300 pra não estourar o limite de payload do callable à toa —
  // refine a busca com "search" se precisar de mais.
  return { services: list.slice(0, 300), total: list.length };
});

// Saldo disponível na sua conta lá na baratosociais.com (pra saber se
// dá pra continuar mandando pedido sem recarregar lá).
exports.adminFetchExternalBalance = onCall({ secrets: [BARATOSOCIAIS_API_KEY] }, async (request) => {
  requireAuth(request);
  if (!isAdminRequest(request)) {
    throw new HttpsError("permission-denied", "Ação restrita ao proprietário.");
  }
  const apiKey = BARATOSOCIAIS_API_KEY.value();
  if (!apiKey) {
    throw new HttpsError("failed-precondition", "Configure o secret BARATOSOCIAIS_API_KEY antes de usar isto.");
  }
  const result = await baratoApi.balance(apiKey);
  return result;
});

// Envio manual (ou reenvio) de um pedido específico pro fornecedor —
// usado quando o envio automático não aconteceu (pacote ainda sem
// mapeamento na hora, erro temporário do fornecedor, etc.).
exports.adminSendOrderToProvider = onCall({ secrets: [BARATOSOCIAIS_API_KEY] }, async (request) => {
  requireAuth(request);
  if (!isAdminRequest(request)) {
    throw new HttpsError("permission-denied", "Ação restrita ao proprietário.");
  }
  const orderId = (request.data || {}).orderId;
  if (!orderId) throw new HttpsError("invalid-argument", "orderId é obrigatório.");
  const orderSnap = await db.collection("orders").doc(orderId).get();
  const order = orderSnap.data();
  if (!order) throw new HttpsError("not-found", "Pedido não encontrado.");
  if (!["paid", "processing", "completed"].includes(order.status)) {
    throw new HttpsError("failed-precondition", "Só é possível enviar pedidos já pagos pro fornecedor.");
  }
  if (order.externalOrderId) {
    throw new HttpsError("failed-precondition", `Este pedido já foi enviado (ID no fornecedor: ${order.externalOrderId}).`);
  }
  const result = await sendOrderToProvider(orderId, order, BARATOSOCIAIS_API_KEY);
  await writeAuditLog({ action: "send_order_to_provider", orderId, performedBy: request.auth.token.email, result });
  if (!result.sent) {
    throw new HttpsError("internal", result.error || "Não foi possível enviar ao fornecedor (veja o motivo no pedido).");
  }
  return result;
});

// Consulta o status atual de um pedido já enviado ao fornecedor e
// atualiza o pedido local com o que ele responder. Só espelha o status
// pro cliente ver (externalStatus) — o status "processing"/"completed"
// do Turbine Brasil só muda sozinho quando o fornecedor confirma que
// terminou ou que já começou a entregar.
exports.adminCheckOrderProviderStatus = onCall({ secrets: [BARATOSOCIAIS_API_KEY] }, async (request) => {
  requireAuth(request);
  if (!isAdminRequest(request)) {
    throw new HttpsError("permission-denied", "Ação restrita ao proprietário.");
  }
  const orderId = (request.data || {}).orderId;
  if (!orderId) throw new HttpsError("invalid-argument", "orderId é obrigatório.");
  const orderSnap = await db.collection("orders").doc(orderId).get();
  const order = orderSnap.data();
  if (!order) throw new HttpsError("not-found", "Pedido não encontrado.");
  if (!order.externalOrderId) {
    throw new HttpsError("failed-precondition", "Este pedido ainda não foi enviado ao fornecedor.");
  }
  const apiKey = BARATOSOCIAIS_API_KEY.value();
  const result = await baratoApi.status(apiKey, order.externalOrderId);

  const rawStatus = String((result && result.status) || "").toLowerCase();
  const update = {
    externalStatus: (result && result.status) || null,
    externalRemains: result && result.remains != null ? Number(result.remains) : null,
    externalStartCount: result && result.start_count != null ? Number(result.start_count) : null,
    providerStatusCheckedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  // Só sobe o status local quando o fornecedor confirma — nunca volta
  // pra trás sozinho (ex.: não reverte "completed" pra "processing").
  if (rawStatus.includes("complet") && order.status !== "completed") {
    update.status = "completed";
  } else if ((rawStatus.includes("progress") || rawStatus.includes("process")) && order.status === "paid") {
    update.status = "processing";
  }
  await db.collection("orders").doc(orderId).set(update, { merge: true });
  return { ok: true, provider: result, localStatus: update.status || order.status };
});

// ---------------------------------------------------------
// Gatilhos automáticos: avisam o proprietário quando o cliente
// sinaliza "já paguei" — substitui as chamadas client-side a
// notifyOwnerWhatsapp() que existiam em markCurrentOrderPaidByCustomer()
// e reportDepositPaid() no index.html (que dependiam da API key
// exposta no HTML).
// ---------------------------------------------------------
exports.onOrderUpdated = onDocumentUpdated(
  { document: "orders/{orderId}", secrets: [CALLMEBOT_PHONE, CALLMEBOT_APIKEY, GMAIL_APP_PASSWORD] },
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
      await sendEmail(
        `💰 Cliente informou pagamento — ${after.userName || after.userEmail || ""}`,
        "Cliente informou que já pagou um pedido no Turbine Brasil\n\n" +
          `Cliente: ${after.userName || ""}\n` +
          `E-mail do cliente: ${after.userEmail || ""}\n` +
          `Tipo de pedido: ${after.service || ""}\n` +
          `Valor: ${money(after.amount)}\n` +
          `Data: ${nowBR()}\n` +
          "Confira o Pix recebido e confirme no Painel do proprietário.\n" +
          `\nID do pedido: ${event.params.orderId}`,
        GMAIL_APP_PASSWORD,
      );
    }
  },
);

exports.onDepositUpdated = onDocumentUpdated(
  { document: "deposits/{depositId}", secrets: [CALLMEBOT_PHONE, CALLMEBOT_APIKEY, GMAIL_APP_PASSWORD] },
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
      await sendEmail(
        `💰 Cliente informou pagamento de depósito — ${after.userName || after.userEmail || ""}`,
        "Cliente informou que já pagou um depósito no Turbine Brasil\n\n" +
          `Cliente: ${after.userName || ""}\n` +
          `E-mail do cliente: ${after.userEmail || ""}\n` +
          `Valor: ${money(after.amount)}\n` +
          `Data: ${nowBR()}\n` +
          "Confira o Pix recebido e confirme no Painel do proprietário.\n" +
          `\nID do depósito: ${event.params.depositId}`,
        GMAIL_APP_PASSWORD,
      );
    }
  },
);
