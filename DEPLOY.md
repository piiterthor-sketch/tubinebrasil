# Guia passo a passo — do zero, sem pular nada

Este guia assume que você **nunca usou o terminal do Firebase antes**. Vá
seguindo na ordem, um passo de cada vez. Cada passo diz exatamente o que
digitar e o que você deve ver na tela para saber que deu certo. Sempre que
houver risco de confusão, tem um aviso "⚠️".

📌 **Atualização:** você me mandou o conteúdo real do seu `index.html`, e eu
já apliquei diretamente nele os 18 pontos de correção (e testei a sintaxe).
Ele está incluído pronto nesta pasta como `index.html` — a Parte 8 agora é
só substituir o arquivo, não editar manualmente.

**Antes de começar:** guarde uma cópia do seu `index.html` atual em outro
lugar (área de trabalho, pasta separada, e-mail para você mesmo — o que for
mais fácil). Se algo sair errado, você volta para essa cópia e tenta de
novo, sem perder nada.

---

## Parte 0 — O que você vai precisar

- O computador onde você edita o site (Windows, Mac ou Linux, tanto faz).
- Acesso à conta Google `piiterthor@gmail.com` (a mesma que já é admin do
  site).
- Acesso ao Console do Firebase do projeto `turbinebrasil-aeec6`
  (https://console.firebase.google.com).
- O arquivo `turbine-brasil-fix.zip` que eu te enviei.
- Uns 40–60 minutos, sem pressa.

**Um detalhe importante sobre custo:** para publicar Cloud Functions, o
projeto Firebase precisa estar no plano **Blaze** (pago por uso, não é
mensalidade fixa). Ele tem uma cota gratuita grande todo mês — para o
volume de um site como o seu, é bem difícil isso gerar cobrança. Se o
projeto ainda estiver no plano Spark (gratuito), o Firebase vai te avisar e
pedir para fazer o upgrade quando você tentar publicar as functions (Passo
9 abaixo) — é só seguir a tela.

---

## Parte 1 — Preparar o computador

### 1.1) Verificar se o Node.js está instalado

Abra o terminal:
- **Windows:** aperte a tecla Windows, digite `PowerShell`, aperte Enter.
- **Mac:** aperte `Cmd + Espaço`, digite `Terminal`, aperte Enter.

Digite exatamente isto e aperte Enter:
```bash
node -v
```
- **Se aparecer algo como `v18.x.x` ou `v20.x.x` ou maior:** ótimo, pule
  para 1.2.
- **Se aparecer erro tipo "comando não encontrado" / "not recognized":**
  você precisa instalar o Node.js primeiro. Vá em
  https://nodejs.org, baixe a versão **LTS** (o botão da esquerda,
  recomendado para a maioria), instale normalmente (clicando "Avançar" em
  tudo), feche e abra o terminal de novo, e repita `node -v` para confirmar.

### 1.2) Instalar o Firebase CLI

No mesmo terminal, digite:
```bash
npm install -g firebase-tools
```
Isso demora um pouco (baixa vários arquivos). No final, confirme que
funcionou:
```bash
firebase --version
```
Deve aparecer um número de versão (ex: `13.x.x`). Se der erro de
permissão no Mac/Linux, tente de novo colocando `sudo` na frente:
```bash
sudo npm install -g firebase-tools
```

### 1.3) Fazer login no Firebase

```bash
firebase login
```
Isso abre uma janela do navegador pedindo para você entrar com a conta
Google. **Entre com `piiterthor@gmail.com`** (a conta admin) e clique em
"Permitir"/"Allow". Depois disso o terminal mostra uma mensagem de sucesso
e você pode fechar a aba do navegador que abriu.

---

## Parte 2 — Organizar os arquivos

### 2.1) Extrair o zip

Descompacte `turbine-brasil-fix.zip` em algum lugar fácil de achar, por
exemplo na Área de Trabalho. Depois de extrair, você vai ter uma pasta
`turbine-brasil-fix` com estes arquivos dentro:
```
turbine-brasil-fix/
├── DEPLOY.md                 (este guia)
├── PATCH-INDEX-HTML.md
├── firebase.json
├── firestore.rules
├── functions/
│   ├── catalog.js
│   ├── index.js
│   ├── package.json
│   └── pix.js
└── scripts/
    └── setAdminClaim.js
```

### 2.2) Colocar junto com o site de verdade

Ache, no seu computador, a pasta onde está o `index.html` **real** do site
(o arquivo publicado, com os dados de verdade — não uma cópia antiga).

Copie estes itens de dentro de `turbine-brasil-fix/` para **dentro dessa
mesma pasta do site**, ao lado do `index.html`:
- `firebase.json`
- `firestore.rules`
- a pasta inteira `functions/`
- a pasta inteira `scripts/` (opcional, só para o Passo 12)

⚠️ **Não copie o `DEPLOY.md` nem o `PATCH-INDEX-HTML.md` para dentro do
projeto** — eles são só leitura, deixe onde extraiu, você vai voltar a eles
depois.

No final, a pasta do seu site deve ficar assim:
```
pasta-do-site/
├── index.html          ← o seu arquivo real, já existia
├── images/              ← já existia
├── firebase.json        ← novo, você acabou de copiar
├── firestore.rules      ← novo
├── functions/           ← novo
└── scripts/             ← novo (opcional)
```

### 2.3) Abrir o terminal dentro dessa pasta

No terminal, entre na pasta do site. Troque o caminho abaixo pelo caminho
real da sua pasta (arraste a pasta para dentro do terminal para ele
preencher o caminho sozinho, funciona no Mac e no Windows):
```bash
cd CAMINHO/DA/PASTA/DO/SITE
```
Confirme que está no lugar certo:
```bash
ls
```
(no Windows PowerShell pode usar `dir` também) — você deve ver `index.html`,
`firebase.json`, `firestore.rules`, `functions` na lista.

### 2.4) Conectar essa pasta ao projeto Firebase certo

```bash
firebase use --add
```
Uma lista de projetos vai aparecer. Use as setas do teclado para escolher
`turbinebrasil-aeec6` e aperte Enter. Quando perguntar um "apelido"
(alias), digite `default` e aperte Enter.

Você deve ver algo como:
```
✔ Created alias default for turbinebrasil-aeec6
Now using alias default (turbinebrasil-aeec6)
```

---

## Parte 3 — Conferir o e-mail do admin (não pule este passo)

Esse é o passo que mais causa erro se for esquecido: o e-mail
`piiterthor@gmail.com` precisa estar **idêntico, em letra minúscula, sem
espaço**, em 3 lugares. Confira um por um:

1. Abra `index.html` (o seu real) num editor de texto (Bloco de Notas,
   VS Code, o que você usar) e procure por `adminEmail:`. Deve estar assim:
   ```js
   adminEmail: "piiterthor@gmail.com",
   ```
2. Abra `firestore.rules` (o novo, que você copiou) e procure por
   `isAdmin()`. Deve estar assim:
   ```
   function isAdmin() {
     return isSignedIn()
       && request.auth.token.email != null
       && request.auth.token.email == "piiterthor@gmail.com";
   }
   ```
3. Abra `functions/index.js` e procure, perto do topo, por `ADMIN_EMAIL`:
   ```js
   const ADMIN_EMAIL = "piiterthor@gmail.com";
   ```

Se o seu e-mail admin for diferente disso, corrija os 3 lugares agora,
antes de continuar, deixando os 3 idênticos.

---

## Parte 4 — Instalar as dependências das Cloud Functions

```bash
cd functions
npm install
```
Isso baixa as bibliotecas necessárias (demora 1–2 minutos, é normal
aparecer um monte de texto passando). No final não deve aparecer nenhuma
linha vermelha grande de "error". Avisos amarelos ("warning") são normais e
podem ser ignorados.

Volte para a pasta principal do site depois:
```bash
cd ..
```

---

## Parte 5 — Trocar a chave do CallMeBot (WhatsApp) e configurar como secret

⚠️ **Importante:** a chave antiga (`2372160`) ficou exposta publicamente no
seu site por um tempo (qualquer visitante que "visse o código-fonte" da
página conseguia ler ela). Trate-a como já vazada e gere uma **nova**.

### 5.1) Gerar uma chave nova no CallMeBot

1. No WhatsApp, adicione o número `+34 644 59 71 68` (número oficial do
   serviço CallMeBot) nos seus contatos, se ainda não tiver.
2. Mande para esse número a mensagem exatamente assim (troque só se seu
   guia antigo pedia outra frase):
   ```
   I allow callmebot to send me messages
   ```
3. Você vai receber de volta uma mensagem com a sua **nova apikey** (um
   número). Anote esse número.

### 5.2) Salvar o telefone e a nova apikey como secrets do Firebase

Ainda no terminal, na pasta do site:
```bash
firebase functions:secrets:set CALLMEBOT_PHONE
```
Ele vai perguntar o valor — digite (sem espaços, sem `+`, sem aspas):
```
5511997694937
```
e aperte Enter. Depois:
```bash
firebase functions:secrets:set CALLMEBOT_APIKEY
```
Cole a **apikey nova** que você recebeu no passo 5.1 e aperte Enter.

Em ambos os casos o terminal deve responder algo como
`✔ Created a new secret version...`.

---

## Parte 6 — Publicar as regras do Firestore

```bash
firebase deploy --only firestore:rules
```
Espere aparecer:
```
✔  Deploy complete!
```
Se aparecer erro de sintaxe nas regras, confira se você não editou nada por
engano dentro de `firestore.rules` — o arquivo deve estar exatamente como
veio no zip (só o e-mail, se for diferente, é o único ponto que você deveria
ter alterado).

---

## Parte 7 — Publicar as Cloud Functions

```bash
firebase deploy --only functions
```
Isso demora de 2 a 6 minutos na primeira vez. Se o projeto ainda estiver no
plano gratuito (Spark), o terminal vai mostrar um aviso e um link para
fazer upgrade para o plano Blaze — abra o link, complete o upgrade (o
Firebase pede um cartão de crédito para o Blaze, mas cobra só o que passar
da cota gratuita), e rode o comando `firebase deploy --only functions` de
novo.

No final, você deve ver algo como:
```
✔  functions[createOrder(us-central1)] Successful create operation.
✔  functions[createDeposit(us-central1)] Successful create operation.
✔  functions[confirmOrderPayment(us-central1)] Successful create operation.
✔  functions[cancelOrder(us-central1)] Successful create operation.
✔  functions[setOrderStatus(us-central1)] Successful create operation.
✔  functions[confirmDepositPayment(us-central1)] Successful create operation.
✔  functions[cancelDeposit(us-central1)] Successful create operation.
✔  functions[onOrderUpdated(us-central1)] Successful create operation.
✔  functions[onDepositUpdated(us-central1)] Successful create operation.
✔  Deploy complete!
```
9 functions no total. Se aparecer menos que isso ou alguma com "Error", copie
a mensagem de erro exata — ela geralmente diz exatamente o que falta (ex:
"secret não encontrado" = volte na Parte 5).

**Deixe uma aba do terminal aberta rodando isto**, você vai usá-la para
testar mais adiante:
```bash
firebase functions:log
```
(Se quiser continuar usando o terminal para outra coisa, abra uma **nova**
aba/janela de terminal e navegue de novo até a pasta do site antes de rodar
esse comando de log.)

---

## Parte 8 — Trocar o `index.html`

⚠️ **Esta parte mudou:** você me mandou o conteúdo real do seu `index.html`
nesta conversa, então eu já apliquei os 18 pontos do patch diretamente nele
— testei a sintaxe (`node --check`) e não ficou nenhuma chave/parêntese
sobrando. Você **não precisa mais editar nada manualmente**: é só substituir
o arquivo.

1. Pegue o arquivo `index.html` que está dentro desta mesma pasta do pacote
   (`turbine-brasil-fix/index.html`) — é a versão já corrigida.
2. Confirme mais uma vez que o e-mail em `APP_CONFIG.adminEmail` bate com o
   seu (Parte 3) — abra o arquivo e procure por `adminEmail:` para
   conferir, já que ele foi copiado do texto que você me mandou.
3. Copie esse arquivo para dentro da pasta do seu projeto, **substituindo**
   o `index.html` antigo (o backup que você guardou no início continua
   valendo como plano B).

Se no futuro você quiser alterar mais alguma coisa nesse arquivo por conta
própria (mudar um texto, um preço de exibição, etc.), `PATCH-INDEX-HTML.md`
continua nesta pasta como referência do que foi mudado e por quê — mas para
a primeira publicação, o arquivo já vem pronto.

### 8.1) Verificar se não ficou nada quebrado (opcional, já testei, mas fique à vontade)

Se quiser conferir com seus próprios olhos: abra o `index.html` novo direto
no navegador (duplo clique nele), abra o Console do navegador (tecla F12 →
aba "Console") e veja se aparece algum erro em vermelho tipo
`Uncaught SyntaxError`. Não deve aparecer nenhum.

⚠️ Abrindo direto pelo navegador (sem estar publicado), o login Google e o
carregamento de dados não vão funcionar de verdade — isso é só para
conferir que não tem erro de sintaxe no código. O teste completo é na
Parte 10.

---

## Parte 9 — Publicar o `index.html` atualizado

Publique o arquivo do mesmo jeito que você sempre publicou (Firebase
Hosting, ou o serviço que você já usa) — este guia não muda nada em como o
site é hospedado, só o conteúdo do arquivo.

Se você usa Firebase Hosting e nunca configurou isso neste terminal, os
comandos seriam:
```bash
firebase deploy --only hosting
```
(Se der erro dizendo que hosting não está configurado, é porque o site é
hospedado em outro lugar — aí é só publicar como você sempre fez, por FTP,
painel do provedor, etc.)

---

## Parte 10 — Testar tudo (checklist)

Marque um por um:

- [ ] Abra o site publicado (o link de verdade, não um arquivo local) numa
      aba anônima/privada do navegador. A página deve carregar normal.
- [ ] Faça login com uma conta Google **que não seja a do admin**.
- [ ] Escolha qualquer pacote e clique em "Comprar via Pix". O QR Code e o
      valor devem aparecer normalmente, como antes.
- [ ] Na aba do terminal com `firebase functions:log` aberta, deve aparecer
      uma linha recente mencionando `createOrder`.
- [ ] Confira se o WhatsApp do número configurado recebeu a notificação
      "🛒 Novo pedido — Turbine Brasil".
- [ ] Deslogue, entre agora com a conta admin (`piiterthor@gmail.com`), abra
      o Painel do proprietário e confirme que o pedido de teste aparece lá.
- [ ] Clique em "Recusar" nesse pedido de teste (ou confirme e depois marque
      como concluído) e confira, no Console do Firebase → Firestore →
      coleção `audit_logs`, se apareceu um registro novo com seu e-mail.
- [ ] (Opcional, mais técnico) Com o DevTools aberto (F12 → Console),
      logado com uma conta que **não** é admin, tente rodar:
      ```js
      db.collection('orders').limit(5).get().then(s => console.log(s.docs.length))
      ```
      O resultado deve ser `0` ou um erro de permissão — nunca uma lista
      com pedidos de outras pessoas.

Se todos os itens acima passaram, o pacote está funcionando corretamente.

---

## Parte 11 (opcional) — Migrar o admin para custom claim

Só faça isso depois que a Parte 10 estiver 100% passando. Resolve o ponto
de ter o e-mail do admin fixo em três arquivos.

1. No Console do Firebase → ⚙️ (ícone de engrenagem) → **Configurações do
   projeto** → aba **Contas de serviço** → botão **Gerar nova chave
   privada**. Um arquivo `.json` será baixado.
2. Renomeie esse arquivo para `service-account.json` e coloque dentro da
   pasta `scripts/` (a que você copiou para o projeto).
   ⚠️ Nunca envie esse arquivo para o GitHub ou qualquer lugar público —
   ele dá acesso total ao seu projeto Firebase. O `.gitignore` incluído já
   bloqueia isso se você usa Git.
3. No Console do Firebase → **Authentication** → aba **Users**, procure a
   linha com `piiterthor@gmail.com` e copie o valor da coluna **User UID**.
4. No terminal:
   ```bash
   cd scripts
   npm install firebase-admin
   node setAdminClaim.js COLE_O_UID_AQUI
   ```
5. Você deve ver `OK: usuário ... agora tem o custom claim admin:true.`
6. No site, saia da conta admin e entre de novo (ou dê F5 forçado com
   Ctrl+Shift+R) para o navegador pegar o novo token.
7. Só depois de confirmar que o painel admin continua funcionando, troque
   (opcional) `isAdmin()` em `firestore.rules` e `ADMIN_EMAIL` em
   `functions/index.js` para usar `request.auth.token.admin == true` em
   vez do e-mail fixo, e publique de novo:
   ```bash
   cd ..
   firebase deploy --only firestore:rules,functions
   ```

---

## Parte 12 (opcional) — Gerar os hashes SRI

Resolve a proteção extra contra CDN comprometido nos scripts de PDF e no
Font Awesome. No terminal (Mac/Linux, ou Windows com Git Bash/WSL):
```bash
for url in \
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" \
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js" \
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
do
  echo "$url"
  curl -s "$url" | openssl dgst -sha384 -binary | openssl base64 -A
  echo
done
```
Cada bloco imprime a URL e, embaixo, um texto longo (o hash). No
`index.html`, ache os comentários `sha384-COLOQUE_AQUI_O_HASH_GERADO` (item
18 do patch) e no `<link>` do Font Awesome (item 1), e cole o hash
correspondente prefixado com `sha384-`, por exemplo:
```html
integrity="sha384-Ab3f9K...resto-do-hash..."
```
Publique o `index.html` de novo depois (Parte 9).

---

## Se algo der errado — problemas comuns

**"firebase: command not found" / "não é reconhecido como comando"**
→ Volte na Parte 1.2, o Firebase CLI não foi instalado corretamente. Feche
e abra o terminal de novo depois de instalar.

**"Error: No currently active project"**
→ Você pulou a Parte 2.4 (`firebase use --add`), ou está rodando o comando
numa pasta diferente da que tem o `firebase.json`. Confira com `pwd` (Mac/
Linux) ou `cd` sozinho (Windows) qual pasta você está, e `ls`/`dir` para
ver se `firebase.json` está ali.

**"permission-denied" ao tentar comprar um pacote no site depois de tudo
publicado**
→ Confira a Parte 3 de novo: o e-mail do admin precisa estar idêntico nos
3 arquivos, e as regras (Parte 6) e functions (Parte 7) precisam ter sido
publicadas com sucesso.

**O botão "Comprar via Pix" fica girando e não gera o Pix**
→ Abra o DevTools (F12) → Console e veja a mensagem de erro exata.
  - Se disser "Pacote inválido ou desatualizado": o item 7 do patch
    (`openPlanCheckout`) não foi aplicado corretamente, ou
    `functions/catalog.js` está desatualizado em relação ao `catalog` do
    HTML.
  - Se disser algo sobre "CORS" ou "não autenticado": confira se você fez
    login antes de clicar em comprar, e se a Parte 7 (deploy das functions)
    terminou com sucesso.

**"O plano do seu projeto não suporta esse recurso" ao publicar functions**
→ O projeto ainda está no plano Spark (gratuito). Siga o link que o
próprio terminal mostra para fazer upgrade para o plano Blaze, e rode o
comando de novo.

**Não chegou a mensagem no WhatsApp**
→ Confira se os dois secrets (Parte 5.2) foram configurados com o telefone
sem `+`/espaços e a apikey certa, e se você publicou as functions **depois**
de configurar os secrets (se configurou o secret depois do deploy, rode
`firebase deploy --only functions` de novo).

**Travei em algum passo e não sei o que fazer**
→ Copie a mensagem de erro exata que apareceu no terminal (ou no Console
do navegador, F12) e me mande — com a mensagem exata eu consigo te dizer
o que fazer, sem precisar adivinhar.

---

## Resumo de comandos (para quem já leu tudo acima e só quer colar)

```bash
# Parte 1
node -v
npm install -g firebase-tools
firebase login

# Parte 2 (rode dentro da pasta do site, depois de copiar os arquivos)
firebase use --add     # escolha turbinebrasil-aeec6, alias "default"

# Parte 4
cd functions
npm install
cd ..

# Parte 5
firebase functions:secrets:set CALLMEBOT_PHONE
firebase functions:secrets:set CALLMEBOT_APIKEY

# Parte 6 e 7
firebase deploy --only firestore:rules
firebase deploy --only functions

# Parte 8 — substitua seu index.html pelo que já vem pronto no pacote

# Parte 9
firebase deploy --only hosting   # se você usa Firebase Hosting
```
