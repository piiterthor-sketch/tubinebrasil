# Patch do `index.html` — aplique estas alterações no seu arquivo real

Estas são as únicas mudanças necessárias no `index.html` que você já tem. Não é
preciso reescrever o arquivo inteiro — abra-o no seu editor, use "Localizar"
(Ctrl+F / Cmd+F) para achar cada trecho "ANTES" abaixo e troque pelo "DEPOIS"
correspondente. A ordem abaixo é a mesma ordem em que os trechos aparecem no
arquivo, de cima para baixo.

> Depois de aplicar tudo, publique também `firestore.rules` e as Cloud
> Functions (`functions/`) — veja `DEPLOY.md`. As três partes (regras,
> functions e HTML) só funcionam corretamente **juntas**.

---

## 1) Font Awesome — preparar para SRI

**ANTES**
```html
    <link
      rel="stylesheet"
      href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
    />
```

**DEPOIS**
```html
    <link
      rel="stylesheet"
      href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
      crossorigin="anonymous"
      referrerpolicy="no-referrer"
    />
```
*(Achado 2.7 — SRI completo é opcional, veja "Gerar hashes SRI" em `DEPLOY.md`.)*

---

## 2) Adicionar o SDK de Cloud Functions

**ANTES**
```html
    <script
      defer
      src="https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js"
    ></script>

    <!-- As bibliotecas de PDF (jsPDF/autotable) NÃO carregam mais aqui —
```

**DEPOIS**
```html
    <script
      defer
      src="https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js"
    ></script>
    <!-- NOVO: necessário para chamar as Cloud Functions (createOrder,
         createDeposit, confirmDepositPayment, cancelOrder, cancelDeposit,
         confirmOrderPayment, setOrderStatus) — ver functions/index.js. -->
    <script
      defer
      src="https://www.gstatic.com/firebasejs/10.12.5/firebase-functions-compat.js"
    ></script>

    <!-- As bibliotecas de PDF (jsPDF/autotable) NÃO carregam mais aqui —
```

---

## 3) `APP_CONFIG` — remover o segredo do CallMeBot do HTML

**ANTES**
```js
        adminEmail: "piiterthor@gmail.com",
        whatsappNumber: "5511997694937",
        // Notificação automática grátis via WhatsApp (CallMeBot) toda vez que um
        // cliente finaliza um pedido ou depósito. Veja o passo a passo para ativar
        // no arquivo GUIA-NOTIFICACAO-WHATSAPP.md. Enquanto "enabled" estiver
        // false, o site funciona normalmente e simplesmente não envia nada.
        notifyWhatsapp: {
          enabled: true,
          phone: "5511997694937",
          apikey: "2372160",
        },
      };

      let firebaseReady = false;
      let auth = null;
      let db = null;
      let currentUser = null;
```

**DEPOIS**
```js
        adminEmail: "piiterthor@gmail.com",
        whatsappNumber: "5511997694937",
        // A notificação automática por WhatsApp (CallMeBot) NÃO mora mais
        // aqui — o telefone/apikey saíram do HTML público (achado 2.3 do
        // relatório de auditoria: qualquer visitante podia ver o código-fonte
        // e roubar essa chave). Agora ela é enviada pela Cloud Function
        // (functions/index.js), usando secrets configurados só no servidor:
        //   firebase functions:secrets:set CALLMEBOT_PHONE
        //   firebase functions:secrets:set CALLMEBOT_APIKEY
      };

      let firebaseReady = false;
      let auth = null;
      let db = null;
      let fx = null; // Cloud Functions (createOrder, createDeposit, ações do admin)
      let currentUser = null;
```

---

## 4) `initFirebase()` — inicializar o SDK de Functions

**ANTES**
```js
          if (!firebase.apps.length)
            firebase.initializeApp(APP_CONFIG.firebase);
          auth = firebase.auth();
          db = firebase.firestore();
          firebaseReady = true;
```

**DEPOIS**
```js
          if (!firebase.apps.length)
            firebase.initializeApp(APP_CONFIG.firebase);
          auth = firebase.auth();
          db = firebase.firestore();
          fx = firebase.functions();
          firebaseReady = true;
```

---

## 5) Remover a função `notifyOwnerWhatsapp` (não é mais chamada do navegador)

**ANTES**
```js
      // Manda uma notificação grátis para o WhatsApp do proprietário via CallMeBot
      // (serviço gratuito, sem custo). Se não estiver configurado (enabled:false ou
      // faltando telefone/apikey), simplesmente não faz nada — nunca trava o site
      // nem impede o pedido de ser criado, mesmo se o envio falhar.
      function notifyOwnerWhatsapp(message) {
        try {
          const cfg = APP_CONFIG.notifyWhatsapp;
          if (
            !cfg ||
            !cfg.enabled ||
            !cfg.phone ||
            cfg.phone.startsWith("COLOQUE_") ||
            !cfg.apikey ||
            cfg.apikey.startsWith("COLOQUE_")
          ) {
            return;
          }
          const url =
            "https://api.callmebot.com/whatsapp.php?phone=" +
            encodeURIComponent(cfg.phone) +
            "&text=" +
            encodeURIComponent(message) +
            "&apikey=" +
            encodeURIComponent(cfg.apikey);
          fetch(url, { mode: "no-cors" }).catch((e) =>
            console.warn(
              "Não foi possível enviar notificação por WhatsApp:",
              e,
            ),
          );
        } catch (e) {
          console.warn("Não foi possível enviar notificação por WhatsApp:", e);
        }
      }
```

**DEPOIS**
```js
      // A notificação por WhatsApp agora é 100% responsabilidade do servidor:
      // functions/index.js dispara ela dentro de createOrder/createDeposit
      // (pedido novo) e nos gatilhos onOrderUpdated/onDepositUpdated (quando
      // o cliente sinaliza "já paguei"). Por isso a função que existia aqui
      // (notifyOwnerWhatsapp) foi removida — ela dependia da API key do
      // CallMeBot exposta neste HTML público (achado 2.3 do relatório).
```

---

## 6) `commentsForWhatsapp` — pode continuar como está
Nenhuma mudança necessária aqui; a função foi movida (copiada) para dentro de
`functions/index.js` também, mas a versão do navegador não é mais chamada
para notificação (só era usada dentro de `notifyOwnerWhatsapp`, que saiu).
Se ela não for usada em mais nenhum lugar do seu arquivo, pode apagá-la —
mas deixá-la parada no arquivo não causa nenhum problema de segurança.

---

## 7) `openPlanCheckout` — guardar a chave do catálogo (não só o preço)

**ANTES**
```js
        document.getElementById("checkoutModal").dataset.plan = JSON.stringify({
          title,
          platform: data.label,
          value: tier.price,
          quantity: tier.qty,
          commentsInput: !!group.commentsInput,
        });
```

**DEPOIS**
```js
        document.getElementById("checkoutModal").dataset.plan = JSON.stringify({
          title,
          platform: data.label,
          value: tier.price, // só para exibição no modal — não decide mais o valor cobrado
          quantity: tier.qty, // idem — só para exibição/contador de comentários
          commentsInput: !!group.commentsInput,
          // Estes três campos são o que realmente importa agora: é o que
          // createManualPixOrder manda para a Cloud Function createOrder,
          // que recalcula o preço de verdade a partir de functions/catalog.js.
          platformKey: platform,
          groupKey,
          tierIndex,
        });
```

---

## 8) `createManualPixOrder` — criar pedido via Cloud Function (corrige 2.2 / 5.1)

**ANTES**
```js
      async function createManualPixOrder(btn) {
        if (!requireLogin()) return;
        if (!firebaseReady) {
          alert("Configure o Firebase antes de criar pedidos.");
          return;
        }
        const link = document.getElementById("checkout-link").value.trim();
        if (!link) {
          alert("Informe o link ou @ do perfil.");
          return;
        }
        if (!APP_CONFIG.pix.key || APP_CONFIG.pix.key.includes("SUA_CHAVE")) {
          alert(
            "Configure sua chave Pix no APP_CONFIG.pix.key antes de receber pagamentos.",
          );
          return;
        }
        const plan0 = JSON.parse(
          document.getElementById("checkoutModal").dataset.plan || "{}",
        );
        let comments = [];
        if (plan0.commentsInput) {
          comments = getCommentsLines("checkout");
          if (!comments.length) {
            alert(
              "Informe os comentários que devem ser postados (um por linha).",
            );
            return;
          }
        }
        await withBusyButton(
          btn,
          '<i class="fa-solid fa-spinner fa-spin"></i> Gerando Pix...',
          async () => {
            const plan = JSON.parse(
              document.getElementById("checkoutModal").dataset.plan || "{}",
            );
            const order = {
              userId: currentUser.uid,
              userName: currentUser.displayName || "",
              userEmail: currentUser.email || "",
              service: plan.title || "",
              platform: plan.platform || "",
              quantity: plan.quantity || extractQuantity(plan.title),
              link,
              amount: Number(plan.value || 0),
              status: "pending_payment",
              createdAt: firebase.firestore.FieldValue.serverTimestamp(),
              updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            };
            if (comments.length) order.comments = comments;
            const ref = await db.collection("orders").add(order);
            currentOrderId = ref.id;
            const payload = buildPixPayload(
              order.amount,
              APP_CONFIG.pix.key,
              APP_CONFIG.pix.merchantName,
              APP_CONFIG.pix.merchantCity,
              "PED" + ref.id.slice(0, 20),
            );
            await ref.update({
              pixPayload: payload,
              pixKey: APP_CONFIG.pix.key,
            });
            notifyOwnerWhatsapp(
              "🛒 Novo pedido — Turbine Brasil\n" +
                `Cliente: ${order.userName} (${order.userEmail})\n` +
                `Serviço: ${order.service} — ${order.platform}\n` +
                `Valor: ${money(order.amount)}\n` +
                `Link: ${order.link}\n` +
                "Status: aguardando pagamento" +
                commentsForWhatsapp(order.comments),
            );
            showPixForOrder(order.amount, payload, "pixModal");
            closeOperationModal("checkoutModal");
          },
        );
      }
```

**DEPOIS**
```js
      async function createManualPixOrder(btn) {
        if (!requireLogin()) return;
        if (!firebaseReady || !fx) {
          alert("Configure o Firebase antes de criar pedidos.");
          return;
        }
        const link = document.getElementById("checkout-link").value.trim();
        if (!link) {
          alert("Informe o link ou @ do perfil.");
          return;
        }
        const plan0 = JSON.parse(
          document.getElementById("checkoutModal").dataset.plan || "{}",
        );
        let comments = [];
        if (plan0.commentsInput) {
          comments = getCommentsLines("checkout");
          if (!comments.length) {
            alert(
              "Informe os comentários que devem ser postados (um por linha).",
            );
            return;
          }
        }
        await withBusyButton(
          btn,
          '<i class="fa-solid fa-spinner fa-spin"></i> Gerando Pix...',
          async () => {
            // O preço/quantidade NÃO são mais definidos aqui no navegador —
            // a Cloud Function createOrder recalcula tudo a partir de
            // functions/catalog.js, ignorando qualquer valor que o cliente
            // tente mandar (corrige o achado crítico 2.2/5.1 do relatório).
            const createOrderFn = fx.httpsCallable("createOrder");
            const result = await createOrderFn({
              platform: plan0.platformKey,
              groupKey: plan0.groupKey,
              tierIndex: plan0.tierIndex,
              link,
              comments,
            });
            const { orderId, amount, pixPayload } = result.data;
            currentOrderId = orderId;
            showPixForOrder(amount, pixPayload, "pixModal");
            closeOperationModal("checkoutModal");
          },
        );
      }
```

---

## 9) `submitOrder` (painel "Novo Pedido") — mesma correção

**ANTES**
```js
      async function submitOrder(btn) {
        if (!requireLogin()) return;
        const { data, group, tier } = getSelectedTier();
        const link = document.getElementById("order-link").value.trim();
        if (!tier || !group || !link) {
          alert("Informe o link e selecione o pacote.");
          return;
        }
        if (!firebaseReady) {
          alert("Configure o Firebase antes de criar pedidos.");
          return;
        }
        if (!APP_CONFIG.pix.key || APP_CONFIG.pix.key.includes("SUA_CHAVE")) {
          alert(
            "Configure sua chave Pix no APP_CONFIG.pix.key antes de receber pagamentos.",
          );
          return;
        }
        let comments = [];
        if (group.commentsInput) {
          comments = getCommentsLines("order");
          if (!comments.length) {
            alert(
              "Informe os comentários que devem ser postados (um por linha).",
            );
            return;
          }
        }
        await withBusyButton(
          btn,
          '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...',
          async () => {
            const amount = Number(tier.price.toFixed(2));
            const order = {
              userId: currentUser.uid,
              userName: currentUser.displayName || "",
              userEmail: currentUser.email || "",
              service: `${tierLabel(tier)} ${group.label}`,
              platform: data.label,
              quantity: tier.qty,
              link,
              amount,
              status: "pending_payment",
              createdAt: firebase.firestore.FieldValue.serverTimestamp(),
              updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            };
            if (comments.length) order.comments = comments;
            const ref = await db.collection("orders").add(order);
            currentOrderId = ref.id;
            const payload = buildPixPayload(
              amount,
              APP_CONFIG.pix.key,
              APP_CONFIG.pix.merchantName,
              APP_CONFIG.pix.merchantCity,
              "PED" + ref.id.slice(0, 20),
            );
            await ref.update({
              pixPayload: payload,
              pixKey: APP_CONFIG.pix.key,
            });
            notifyOwnerWhatsapp(
              "🛒 Novo pedido — Turbine Brasil\n" +
                `Cliente: ${order.userName} (${order.userEmail})\n` +
                `Serviço: ${order.service} — ${order.platform}\n` +
                `Valor: ${money(order.amount)}\n` +
                `Link: ${order.link}\n` +
                "Status: aguardando pagamento" +
                commentsForWhatsapp(order.comments),
            );
            showPixForOrder(amount, payload, "pixModal");
          },
        );
      }
```

**DEPOIS**
```js
      async function submitOrder(btn) {
        if (!requireLogin()) return;
        const { platform, groupKey, group, tier } = getSelectedTier();
        const link = document.getElementById("order-link").value.trim();
        if (!tier || !group || !link) {
          alert("Informe o link e selecione o pacote.");
          return;
        }
        if (!firebaseReady || !fx) {
          alert("Configure o Firebase antes de criar pedidos.");
          return;
        }
        let comments = [];
        if (group.commentsInput) {
          comments = getCommentsLines("order");
          if (!comments.length) {
            alert(
              "Informe os comentários que devem ser postados (um por linha).",
            );
            return;
          }
        }
        const tierIndex = parseInt(
          document.getElementById("service-select").value || "0",
          10,
        );
        await withBusyButton(
          btn,
          '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...',
          async () => {
            // Preço/quantidade recalculados no servidor — mesmo motivo do
            // createManualPixOrder acima (achado 2.2/5.1).
            const createOrderFn = fx.httpsCallable("createOrder");
            const result = await createOrderFn({
              platform,
              groupKey,
              tierIndex,
              link,
              comments,
            });
            const { orderId, amount, pixPayload } = result.data;
            currentOrderId = orderId;
            showPixForOrder(amount, pixPayload, "pixModal");
          },
        );
      }
```

---

## 10) `createDepositPix` — criar depósito via Cloud Function

**ANTES**
```js
      async function createDepositPix(btn) {
        if (!requireLogin() || !firebaseReady) return;
        const amount = Number(
          document.getElementById("deposit-amount").value || 0,
        );
        if (amount < 1) {
          alert("Informe um valor mínimo de R$ 1,00.");
          return;
        }
        if (APP_CONFIG.pix.key.includes("SUA_CHAVE")) {
          alert("Configure sua chave Pix no APP_CONFIG.pix.key.");
          return;
        }
        await withBusyButton(
          btn,
          '<i class="fa-solid fa-spinner fa-spin"></i> Gerando Pix...',
          async () => {
            const ref = await db.collection("deposits").add({
              userId: currentUser.uid,
              userName: currentUser.displayName || "",
              userEmail: currentUser.email || "",
              amount,
              status: "pending_payment",
              createdAt: firebase.firestore.FieldValue.serverTimestamp(),
              updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
            currentDepositId = ref.id;
            const payload = buildPixPayload(
              amount,
              APP_CONFIG.pix.key,
              APP_CONFIG.pix.merchantName,
              APP_CONFIG.pix.merchantCity,
              "DEP" + ref.id.slice(0, 20),
            );
            await ref.update({
              pixPayload: payload,
              pixKey: APP_CONFIG.pix.key,
            });
            notifyOwnerWhatsapp(
              "💵 Novo depósito — Turbine Brasil\n" +
                `Cliente: ${currentUser.displayName || ""} (${currentUser.email || ""})\n` +
                `Valor: ${money(amount)}\n` +
                "Status: aguardando pagamento",
            );
            document.getElementById("deposit-pix-area").innerHTML =
              `<div class="pix-card"><strong>${money(amount)}</strong><div class="pix-qr"><img id="deposit-qr-img" alt="QR Code Pix"></div><textarea class="pix-code" id="deposit-copy-code" readonly>${esc(payload)}</textarea><button class="op-btn secondary" onclick="copyDepositCode()">Copiar Pix</button><button class="op-btn success" onclick="reportDepositPaid()">Já fiz o pagamento</button><span class="status-pill status-pending">AGUARDANDO CONFIRMAÇÃO</span></div>`;
            setQrImage(document.getElementById("deposit-qr-img"), payload);
          },
        );
      }
```

**DEPOIS**
```js
      async function createDepositPix(btn) {
        if (!requireLogin() || !firebaseReady || !fx) return;
        const amount = Number(
          document.getElementById("deposit-amount").value || 0,
        );
        if (amount < 1) {
          alert("Informe um valor mínimo de R$ 1,00.");
          return;
        }
        await withBusyButton(
          btn,
          '<i class="fa-solid fa-spinner fa-spin"></i> Gerando Pix...',
          async () => {
            // A validação final de faixa de valor (min/máx) acontece no
            // servidor — o campo acima é só conveniência de interface.
            const createDepositFn = fx.httpsCallable("createDeposit");
            const result = await createDepositFn({ amount });
            const { depositId, amount: confirmedAmount, pixPayload } = result.data;
            currentDepositId = depositId;
            document.getElementById("deposit-pix-area").innerHTML =
              `<div class="pix-card"><strong>${money(confirmedAmount)}</strong><div class="pix-qr"><img id="deposit-qr-img" alt="QR Code Pix"></div><textarea class="pix-code" id="deposit-copy-code" readonly>${esc(pixPayload)}</textarea><button class="op-btn secondary" onclick="copyDepositCode()">Copiar Pix</button><button class="op-btn success" onclick="reportDepositPaid()">Já fiz o pagamento</button><span class="status-pill status-pending">AGUARDANDO CONFIRMAÇÃO</span></div>`;
            setQrImage(document.getElementById("deposit-qr-img"), pixPayload);
          },
        );
      }
```

---

## 11) `markCurrentOrderPaidByCustomer` — tirar a notificação client-side

**ANTES**
```js
          document.getElementById("pix-status").textContent =
            "PAGAMENTO INFORMADO — AGUARDANDO CONFERÊNCIA";
          document.getElementById("pix-status").className =
            "status-pill status-pending";
          notifyOwnerWhatsapp(
            "💰 Cliente informou pagamento — Turbine Brasil\n" +
              `Pedido #${currentOrderId}\n` +
              "Confira o Pix recebido e confirme no Painel do proprietário.",
          );
          alert(
            "Pagamento informado. Agora o proprietário irá conferir o Pix e confirmar seu pedido.",
          );
```

**DEPOIS**
```js
          document.getElementById("pix-status").textContent =
            "PAGAMENTO INFORMADO — AGUARDANDO CONFERÊNCIA";
          document.getElementById("pix-status").className =
            "status-pill status-pending";
          // A notificação ao proprietário agora dispara sozinha no servidor
          // (gatilho onOrderUpdated em functions/index.js) assim que o
          // status muda para "payment_reported" — não precisa mais chamar
          // nada daqui.
          alert(
            "Pagamento informado. Agora o proprietário irá conferir o Pix e confirmar seu pedido.",
          );
```

---

## 12) `reportDepositPaid` — mesma remoção

**ANTES**
```js
          notifyOwnerWhatsapp(
            "💰 Cliente informou pagamento de depósito — Turbine Brasil\n" +
              `Depósito #${currentDepositId}\n` +
              "Confira o Pix recebido e confirme no Painel do proprietário.",
          );
          alert("Pagamento informado. Aguarde a confirmação do proprietário.");
```

**DEPOIS**
```js
          // Gatilho onDepositUpdated (functions/index.js) notifica o
          // proprietário automaticamente — nada a fazer aqui.
          alert("Pagamento informado. Aguarde a confirmação do proprietário.");
```

---

## 13) `confirmOrderPayment` (admin) — via Cloud Function

**ANTES**
```js
      async function confirmOrderPayment(id, btn) {
        if (!isAdmin()) return;
        await withBusyButton(
          btn,
          '<i class="fa-solid fa-spinner fa-spin"></i> Confirmando...',
          async () => {
            const ref = db.collection("orders").doc(id);
            const snap = await ref.get();
            const o = snap.data();
            if (!o) throw new Error("Pedido não encontrado.");
            await ref.set(
              {
                status: "paid",
                paymentConfirmedAt:
                  firebase.firestore.FieldValue.serverTimestamp(),
                confirmedBy: currentUser.email,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true },
            );
            alert("Pagamento confirmado. Pedido liberado.");
          },
        );
      }
```

**DEPOIS**
```js
      async function confirmOrderPayment(id, btn) {
        if (!isAdmin()) return;
        await withBusyButton(
          btn,
          '<i class="fa-solid fa-spinner fa-spin"></i> Confirmando...',
          async () => {
            // Agora roda como Cloud Function e grava em audit_logs quem
            // confirmou (achado 2.10).
            await fx.httpsCallable("confirmOrderPayment")({ orderId: id });
            alert("Pagamento confirmado. Pedido liberado.");
          },
        );
      }
```

---

## 14) `cancelOrder` (admin) — via Cloud Function (grava quem cancelou)

**ANTES**
```js
      async function cancelOrder(id, btn) {
        if (!isAdmin()) return;
        if (!confirm("Recusar este pedido?")) return;
        await withBusyButton(
          btn,
          '<i class="fa-solid fa-spinner fa-spin"></i> Recusando...',
          async () => {
            await db.collection("orders").doc(id).set(
              {
                status: "cancelled",
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true },
            );
          },
        );
      }
```

**DEPOIS**
```js
      async function cancelOrder(id, btn) {
        if (!isAdmin()) return;
        if (!confirm("Recusar este pedido?")) return;
        await withBusyButton(
          btn,
          '<i class="fa-solid fa-spinner fa-spin"></i> Recusando...',
          async () => {
            // Agora grava cancelledBy/cancelledAt (achado 2.10 — antes o
            // cancelamento não registrava quem tinha feito).
            await fx.httpsCallable("cancelOrder")({ orderId: id });
          },
        );
      }
```

---

## 15) `setOrderStatus` (admin) — via Cloud Function

**ANTES**
```js
      async function setOrderStatus(id, status, btn) {
        if (!isAdmin()) return;
        await withBusyButton(
          btn,
          '<i class="fa-solid fa-spinner fa-spin"></i> Atualizando...',
          async () => {
            await db.collection("orders").doc(id).set(
              {
                status,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true },
            );
          },
        );
      }
```

**DEPOIS**
```js
      async function setOrderStatus(id, status, btn) {
        if (!isAdmin()) return;
        await withBusyButton(
          btn,
          '<i class="fa-solid fa-spinner fa-spin"></i> Atualizando...',
          async () => {
            await fx.httpsCallable("setOrderStatus")({ orderId: id, status });
          },
        );
      }
```

---

## 16) `confirmDepositPayment` (admin) — via Cloud Function

**ANTES**
```js
      async function confirmDepositPayment(id, btn) {
        if (!isAdmin()) return;
        await withBusyButton(
          btn,
          '<i class="fa-solid fa-spinner fa-spin"></i> Confirmando...',
          async () => {
            const ref = db.collection("deposits").doc(id);
            // IMPORTANTE: a checagem de "já foi pago?" acontece DENTRO da
            // transação (não antes) — isso evita creditar o saldo em dobro
            // se o botão for clicado duas vezes rápido ou se houver duas
            // abas do painel admin abertas ao mesmo tempo.
            await db.runTransaction(async (tx) => {
              const depSnap = await tx.get(ref);
              const dep = depSnap.data();
              if (!dep) throw new Error("Depósito não encontrado.");
              if (dep.status === "paid") return; // já confirmado — não credita de novo.
              const userRef = db.collection("users").doc(dep.userId);
              const us = await tx.get(userRef);
              const balance = Number((us.data() || {}).balance || 0);
              tx.update(userRef, {
                balance: balance + Number(dep.amount || 0),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
              });
              tx.update(ref, {
                status: "paid",
                paymentConfirmedAt:
                  firebase.firestore.FieldValue.serverTimestamp(),
                confirmedBy: currentUser.email,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
              });
            });
          },
        );
      }
```

**DEPOIS**
```js
      async function confirmDepositPayment(id, btn) {
        if (!isAdmin()) return;
        await withBusyButton(
          btn,
          '<i class="fa-solid fa-spinner fa-spin"></i> Confirmando...',
          async () => {
            // A transação (idempotente — não credita duas vezes) agora
            // roda no servidor, com auditoria em audit_logs.
            await fx.httpsCallable("confirmDepositPayment")({ depositId: id });
          },
        );
      }
```

---

## 17) `cancelDeposit` (admin) — via Cloud Function

**ANTES**
```js
      async function cancelDeposit(id, btn) {
        if (!isAdmin()) return;
        if (!confirm("Recusar este depósito?")) return;
        await withBusyButton(
          btn,
          '<i class="fa-solid fa-spinner fa-spin"></i> Recusando...',
          async () => {
            await db.collection("deposits").doc(id).set(
              {
                status: "cancelled",
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true },
            );
          },
        );
      }
```

**DEPOIS**
```js
      async function cancelDeposit(id, btn) {
        if (!isAdmin()) return;
        if (!confirm("Recusar este depósito?")) return;
        await withBusyButton(
          btn,
          '<i class="fa-solid fa-spinner fa-spin"></i> Recusando...',
          async () => {
            await fx.httpsCallable("cancelDeposit")({ depositId: id });
          },
        );
      }
```

---

## 18) Preparar os scripts de PDF para SRI (opcional, mas recomendado)

**ANTES**
```js
      function loadScriptOnce(src) {
        return new Promise((resolve, reject) => {
          if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
          }
          const s = document.createElement("script");
          s.src = src;
          s.onload = () => resolve();
          s.onerror = () =>
            reject(new Error("Não foi possível carregar " + src));
          document.head.appendChild(s);
        });
      }
      async function loadPdfLibraries() {
        if (window.jspdf && window.jspdf.jsPDF) return;
        await loadScriptOnce(
          "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
        );
        await loadScriptOnce(
          "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js",
        );
      }
```

**DEPOIS**
```js
      // "integrity" é opcional: quando preenchido (veja "Gerar hashes SRI"
      // em DEPLOY.md), o navegador recusa carregar o script se o conteúdo
      // baixado não bater com o hash — proteção contra CDN comprometido
      // (achado 2.7 do relatório, especialmente sensível aqui porque só o
      // ADMIN carrega este script, na própria sessão logada dele).
      function loadScriptOnce(src, integrity) {
        return new Promise((resolve, reject) => {
          if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
          }
          const s = document.createElement("script");
          s.src = src;
          s.crossOrigin = "anonymous";
          if (integrity) s.integrity = integrity;
          s.onload = () => resolve();
          s.onerror = () =>
            reject(new Error("Não foi possível carregar " + src));
          document.head.appendChild(s);
        });
      }
      async function loadPdfLibraries() {
        if (window.jspdf && window.jspdf.jsPDF) return;
        await loadScriptOnce(
          "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
          // "sha384-COLOQUE_AQUI_O_HASH_GERADO" — veja DEPLOY.md
        );
        await loadScriptOnce(
          "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js",
          // "sha384-COLOQUE_AQUI_O_HASH_GERADO" — veja DEPLOY.md
        );
      }
```

---

## O que **não** precisa mudar
- `buildPixPayload`, `tag`, `crc16`, `normalizePixText`, `decodePixAmount`,
  `pixAmountMismatchWarning`: podem continuar no arquivo sem problema (não
  são mais chamadas na criação de pedido/depósito, mas não fazem mal
  nenhum ficando — se quiser deixar o arquivo mais enxuto, pode apagar
  `buildPixPayload`/`tag`/`crc16`/`normalizePixText`, já que agora só
  existem no servidor em `functions/pix.js`).
- Todo o resto do site (UI, catálogo de exibição, FAQ, responsividade
  etc.) fica exatamente igual.
