# Turbine Brasil — Como funciona o repasse para a baratosociais.com + roteiro de testes

Data: 21/08/2026

## 1. Como funciona o dinheiro (repasse)

Isso é o ponto mais importante pra entender antes de testar: **não existe nenhuma transferência automática de dinheiro entre o Turbine Brasil e a baratosociais.com.** São duas carteiras completamente separadas:

- **O que o cliente paga (Pix)** cai direto na sua chave Pix pessoal (a mesma configurada em `PIX_CONFIG`/`APP_CONFIG.pix`, `+5511997694937`). Isso não muda em nada com essa integração — continua exatamente como já era.
- **O que a baratosociais.com cobra** sai de um saldo pré-pago que você mantém *na conta da baratosociais.com*, carregado por você com o seu próprio dinheiro (fora do Turbine Brasil, direto no painel deles). Toda vez que o sistema manda um pedido pra lá (`createOrder`/`confirmOrderPayment` chamando `sendOrderToProvider`), a baratosociais.com desconta o custo daquele pedido *desse saldo pré-carregado* — não do dinheiro que o cliente te pagou.

Ou seja: o "restante" que você perguntou como vai receber **não é recebido por nenhuma transferência** — ele simplesmente **nunca sai da sua mão**, porque você só gastou uma fração do que cobrou. Exemplo prático com o pacote de 1000 seguidores BR baixa qualidade:

| | Valor |
|---|---|
| Cliente paga (Pix, cai na sua chave) | R$ 12,99 |
| Você gasta na baratosociais.com (debitado do seu saldo pré-pago lá) | R$ 7,50 |
| **Sua margem (fica com você, sem nenhuma ação extra)** | **R$ 5,49 (~42%)** |

Sua única responsabilidade operacional é: de tempos em tempos, olhar o saldo na baratosociais.com (botão "💰 Ver saldo no fornecedor" no painel admin) e recarregar lá com uma parte do seu lucro, antes que o saldo acabe — se acabar, os pedidos novos vão falhar ao tentar enviar automaticamente (o pedido continua válido e pago no Turbine Brasil, só fica marcado com erro pra você enviar manualmente depois de recarregar).

## 2. O mapeamento que fiz com as 5 planilhas que você mandou

Configurei `functions/externalServiceMap.js` ligando 43 combinações de pacote→serviço da baratosociais.com, com a margem de cada um calculada. Alguns grupos ficaram **de fora do envio automático por enquanto** — não é erro, é porque as planilhas não tinham informação suficiente pra eu decidir com segurança:

| Grupo | Motivo de não estar (ainda) mapeado |
|---|---|
| Seguidores BR Baixa/Alta — pacotes de 100/300/500 | A planilha de seguidores mostra quantidade mínima = 1.000 pra todo mundo — abaixo disso a baratosociais.com provavelmente recusa. Só o pacote de 1.000 de cada um foi mapeado. |
| Seguidores Mundiais (todos os tamanhos) | Nenhuma das 5 planilhas trouxe um serviço "seguidores mundiais" (só tinham BR e por estado). Preciso do ID desse serviço específico. |
| Comentários (Unissex/Mulheres/Homens) | Nenhuma planilha trouxe serviço de comentário com texto personalizado — continuam 100% manuais, do jeito que já funcionavam. |
| "Seguidores por Estado" (planilha à parte, 12 estados, R$16,69/1.000) | Esse serviço não existe ainda como pacote à venda no seu site — os IDs ficaram fora porque não tem produto correspondente em `catalog.js`. Se quiser vender isso, me diga o preço que quer cobrar que eu crio o pacote novo. |

Todos os pacotes que **não estão mapeados continuam funcionando normalmente** — o cliente paga, o pedido fica registrado, só não é enviado sozinho pro fornecedor (fica pra você enviar manualmente pelo botão "🔌 Enviar para fornecedor" no card do pedido, ou entregar por fora, como já fazia antes dessa integração existir).

## 3. TikTok

Como pedido, todo o catálogo de TikTok (Seguidores, Curtidas, Visualizações, Compartilhamentos) foi **comentado** — não apagado — tanto em `functions/catalog.js` quanto em `index.html`, e a aba "TikTok" da seção "Escolha Sua Rede Social" também ficou escondida (comentada). O código inteiro continua lá, só que inativo: se um dia você quiser voltar a vender TikTok, é só me avisar que eu descomento os três blocos (procure o comentário "TIKTOK — DESATIVADO" nos arquivos) e reimplanto.

## 4. Roteiro de testes para hoje

Faça nesta ordem. Cada passo já indica o que você deve ver se estiver certo.

### Passo 1 — Substituir os arquivos no seu Mac
Troque estes 3 arquivos na sua pasta do projeto pelos que estou te enviando agora:
- `functions/index.js`
- `functions/catalog.js`
- `functions/externalServiceMap.js`
- `index.html`

### Passo 2 — Configurar a chave da baratosociais.com (se ainda não fez)
No Terminal.app do Mac:
```
cd "/Users/piteralexfreesz/Downloads/turbine-brasil-fix 5"
firebase functions:secrets:set BARATOSOCIAIS_API_KEY
```
Digite a chave da sua conta na baratosociais.com quando o terminal pedir (Conta → API, no painel deles) e pressione Enter uma vez.

### Passo 3 — Reimplantar as funções
```
firebase deploy --only functions
```
Espere aparecer `✔ Deploy complete!`. Isso também resolve, de vez, a pendência antiga do desconto de saldo que ainda não tinha sido publicada.

### Passo 4 — Subir o `index.html` novo
No VS Code: Commit → Push (Vercel publica sozinho em alguns segundos).

### Passo 5 — Conferir o saldo na baratosociais.com
No site, entre como admin → painel do proprietário → "💰 Ver saldo no fornecedor". Confirme que aparece um valor (não um erro) — isso prova que a secret e a chave estão certas.

### Passo 6 — Teste de um pedido MAPEADO (envio automático)
1. Entre como um cliente de teste com saldo (ou adicione saldo de teste).
2. Faça um pedido de **"1000 🇧🇷 Seguidores BR — Baixa Qualidade"** (R$12,99) usando saldo suficiente pra cobrir tudo — esse pacote está mapeado (id 1187).
3. No painel admin, confirme o pagamento (se não tiver sido pago só com saldo).
4. Abra o card desse pedido no painel admin: deve aparecer "🔌 Fornecedor #XXXXX — status: Pending" automaticamente, sem você clicar em nada.
5. Depois de alguns minutos, clique em "🔄 Verificar status fornecedor" pra ver se já avançou (ex.: "In progress").

### Passo 7 — Teste de um pedido NÃO mapeado (fica manual, como esperado)
1. Faça um pedido de **"100 🇧🇷 Seguidores BR — Baixa Qualidade"** (R$2,99) — esse tier específico não está mapeado (mínimo de 1.000 do fornecedor).
2. Confirme o pagamento.
3. No card do pedido, deve aparecer o botão **"🔌 Enviar para fornecedor"** em vez do envio automático — clique nele só se quiser testar manualmente com uma quantidade maior, ou deixe assim mesmo (esse pacote seguirá sendo entregue por fora, como sempre foi).

### Passo 8 — Confirmar que o TikTok sumiu
Na página inicial, na seção "Escolha Sua Rede Social", confirme que só aparece a aba "Instagram" (sem "TikTok"). No painel "Novo Pedido", o campo "Categoria" também não deve mais listar nenhum pacote de TikTok.

### Passo 9 — Teste do saldo (retomando a pendência anterior)
Faça um pedido pelo formulário "Novo Pedido" usando um cliente com saldo suficiente pra cobrir tudo. Confirme que:
- A mensagem mostra o valor certo do pedido e quanto foi descontado do saldo.
- O saldo no topo da tela cai na hora certa (não fica em R$0,00 indevidamente).

Se qualquer passo não bater com o que descrevi, me manda o print/erro que eu já reviso.
