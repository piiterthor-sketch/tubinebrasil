// =========================================================
// TURBINE BRASIL — Cliente da API da baratosociais.com
// -----------------------------------------------------------
// Mesma interface da classe `Api` em PHP que você já usava (order,
// status, multiStatus, services, refill, multiRefill, refillStatus,
// multiRefillStatus, cancel, balance) — só que em Node, usando o
// fetch nativo (Node 20 já vem com ele, sem precisar instalar nada).
//
// IMPORTANTE: isso só pode ser chamado de dentro das Cloud Functions
// (functions/index.js), nunca do navegador — a API key da
// baratosociais.com fica guardada como "secret" do Firebase
// (BARATOSOCIAIS_API_KEY), do mesmo jeito que a chave do CallMeBot,
// e nunca é exposta no HTML/JS público.
// =========================================================
const API_URL = "https://baratosociais.com/api/v2";

async function callApi(apiKey, params) {
  const body = new URLSearchParams({ key: apiKey, ...params });
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(
      `Resposta inválida da baratosociais.com (HTTP ${res.status}): ${text.slice(0, 300)}`,
    );
  }
  if (json && typeof json === "object" && json.error) {
    throw new Error(`baratosociais.com: ${json.error}`);
  }
  return json;
}

/** Cria um pedido lá no fornecedor. `data` = { service, link, quantity, ... } */
function order(apiKey, data) {
  return callApi(apiKey, { action: "add", ...data });
}

/** Status de um único pedido no fornecedor. */
function status(apiKey, orderId) {
  return callApi(apiKey, { action: "status", order: orderId });
}

/** Status de vários pedidos de uma vez (array de IDs do fornecedor). */
function multiStatus(apiKey, orderIds) {
  return callApi(apiKey, { action: "status", orders: (orderIds || []).join(",") });
}

/** Lista completa de serviços/preços do fornecedor. */
function services(apiKey) {
  return callApi(apiKey, { action: "services" });
}

function refill(apiKey, orderId) {
  return callApi(apiKey, { action: "refill", order: orderId });
}

function multiRefill(apiKey, orderIds) {
  return callApi(apiKey, { action: "refill", orders: (orderIds || []).join(",") });
}

function refillStatus(apiKey, refillId) {
  return callApi(apiKey, { action: "refill_status", refill: refillId });
}

function multiRefillStatus(apiKey, refillIds) {
  return callApi(apiKey, { action: "refill_status", refills: (refillIds || []).join(",") });
}

function cancel(apiKey, orderIds) {
  return callApi(apiKey, { action: "cancel", orders: (orderIds || []).join(",") });
}

/** Saldo disponível na sua conta lá na baratosociais.com. */
function balance(apiKey) {
  return callApi(apiKey, { action: "balance" });
}

module.exports = {
  order,
  status,
  multiStatus,
  services,
  refill,
  multiRefill,
  refillStatus,
  multiRefillStatus,
  cancel,
  balance,
};
