// =========================================================
// TURBINE BRASIL — Mapeamento de pacotes -> serviço da baratosociais.com
// -----------------------------------------------------------
// Cada pacote seu (catalog.js) precisa ser ligado ao ID de serviço
// correspondente lá na baratosociais.com antes que o envio automático
// pro fornecedor funcione para ele. Enquanto um pacote não estiver
// listado aqui, o pedido continua sendo criado e pago normalmente no
// Turbine Brasil — só o envio automático pro fornecedor é pulado (fica
// pendente, pra você enviar manualmente pelo painel admin quando
// quiser, ou depois de preencher o mapeamento e reimplantar).
//
// Como descobrir os IDs: no painel do proprietário, use o botão
// "Ver serviços do fornecedor" (chama a função adminFetchExternalServices,
// que devolve a lista completa de serviços/preços da baratosociais.com)
// e procure o serviço equivalente a cada pacote seu.
//
// Formato da chave: "plataforma.grupo.índiceDoTier"
//   - "plataforma" e "grupo" = as mesmas chaves usadas em catalog.js
//     (ex.: "instagram", "seguidores_br_baixa")
//   - "índiceDoTier" = posição do pacote dentro do array "tiers"
//     daquele grupo, começando em 0 (o primeiro item da lista é 0,
//     o segundo é 1, e assim por diante)
//
// Exemplo (depois de você me passar/preencher os IDs reais):
//   "instagram.seguidores_br_baixa.0": 1234, // 100 seguidores BR — baixa qualidade
//   "instagram.seguidores_br_baixa.1": 1235, // 300 seguidores BR — baixa qualidade
//   "tiktok.curtidas.0": 5566,               // 100 curtidas TikTok
// =========================================================
// =========================================================
// MAPEAMENTO PREENCHIDO EM 21/08/2026 a partir das 5 planilhas que
// você me enviou (baratosociais.com). Cada linha abaixo mostra:
// preço que você cobra do cliente, custo na baratosociais.com pra
// aquela mesma quantidade, e sua margem — pra você conferir que
// nenhum pacote está vendendo abaixo do custo.
//
// !! IMPORTANTE — pacotes que NÃO foram mapeados (ficam de fora do
// envio automático, continuam exigindo entrega manual por enquanto) !!
//  - seguidores_br_baixa (100/300/500) e seguidores_br_alta (100/300/500):
//    a planilha de seguidores BR mostra QUANTIDADE MÍNIMA = 1000 pra
//    todos os serviços dela — abaixo disso a baratosociais.com
//    provavelmente recusaria o pedido. Só o tier de 1000 unidades de
//    cada grupo foi mapeado.
//  - seguidores_mundiais (todos os tiers): nenhuma das 5 planilhas
//    tinha um serviço de "seguidores mundiais" (só tinha BR e por
//    estado) — preciso que você me mande o ID desse serviço lá na
//    baratosociais.com pra eu completar.
//  - comentarios_unissex / comentarios_mulheres / comentarios_homens
//    (todos os tiers): nenhuma planilha trouxe serviço de comentário
//    com texto personalizado — continuam 100% manuais, como já eram.
//  - "Seguidores do Instagram por Estado" (planilha à parte, 12
//    estados a R$16,69/1.000): esse serviço não existe ainda como
//    pacote à venda no seu site — os IDs ficaram de fora do mapeamento
//    porque não há tier correspondente em catalog.js. Se você quiser
//    vender isso como produto novo, me avise o preço que quer cobrar
//    que eu crio o pacote.
// =========================================================
const externalServiceMap = {
  // ---- 🇧🇷 Seguidores BR — Baixa Qualidade (só o tier de 1000; ver aviso acima) ----
  // 1000 un. | você cobra R$12,99 | custo R$7,50 (id 1187, "BR BARATO") | margem R$5,49 (~42%)
  "instagram.seguidores_br_baixa.3": 1187,

  // ---- 🇧🇷 Seguidores BR — Alta Qualidade / Orgânicos (só o tier de 1000; ver aviso acima) ----
  // 1000 un. | você cobra R$149,99 | custo R$75,26 (id 1283, "ORGÂNICOS") | margem R$74,73 (~50%)
  "instagram.seguidores_br_alta.3": 1283,

  // ---- ❤️ Curtidas Mundiais (só o tier de 1000 tinha 1000+ unidades) ----
  // 1000 un. | você cobra R$9,99 | custo R$0,77 (id 17, "Instagram Curtidas Barato") | margem R$9,22 (~92%)
  "instagram.curtidas_mundiais.4": 17,

  // ---- 🇧🇷 Curtidas BR — Baixa Qualidade (todos os tiers — sem mínimo informado p/ curtidas) ----
  // id 23 "Curtidas no Instagram | BR | BARATO" — R$2,01/1.000
  // 100→R$2,99 (custo R$0,20, margem 93%) · 300→R$4,99 (custo R$0,60, margem 88%)
  // 500→R$7,99 (custo R$1,01, margem 87%) · 1000→R$12,99 (custo R$2,01, margem 85%)
  "instagram.curtidas_br_baixa.0": 23,
  "instagram.curtidas_br_baixa.1": 23,
  "instagram.curtidas_br_baixa.2": 23,
  "instagram.curtidas_br_baixa.3": 23,

  // ---- 🇧🇷 Curtidas BR — Alta Qualidade (todos os tiers) ----
  // id 1044 "Curtidas no Instagram | BR | PREMIUM MELHOR" — R$10,83/1.000
  // 100→R$4,99 (custo R$1,08, margem 78%) · 300→R$7,99 (custo R$3,25, margem 59%)
  // 500→R$11,99 (custo R$5,42, margem 55%)
  "instagram.curtidas_br_alta.0": 1044,
  "instagram.curtidas_br_alta.1": 1044,
  "instagram.curtidas_br_alta.2": 1044,

  // ---- 🙋‍♀️ Curtidas Mulheres BR (todos os tiers) ----
  // id 729 "Curtidas no Instagram | BR | MULHERES | ALTA QUALIDADE" — R$2,45/1.000
  // 100→R$2,99 (margem 92%) · 300→R$4,99 (margem 85%) · 500→R$7,99 (margem 85%) · 1000→R$12,99 (margem 81%)
  "instagram.curtidas_mulheres_br.0": 729,
  "instagram.curtidas_mulheres_br.1": 729,
  "instagram.curtidas_mulheres_br.2": 729,
  "instagram.curtidas_mulheres_br.3": 729,

  // ---- 🙋‍♂️ Curtidas Homens BR (todos os tiers) ----
  // id 730 "Curtidas no Instagram | BR | PERFIS HOMENS | ALTA QUALIDADE" — R$2,45/1.000
  // Mesmas margens do grupo "Mulheres BR" acima.
  "instagram.curtidas_homens_br.0": 730,
  "instagram.curtidas_homens_br.1": 730,
  "instagram.curtidas_homens_br.2": 730,
  "instagram.curtidas_homens_br.3": 730,

  // ---- 🎬 Visualizações no Reels — +300% de Bônus (todos os tiers) ----
  // id 455 "Nova Visualizações no Reels + IGTV Super Rápido" — R$0,12/1.000
  // ATENÇÃO: aqui o custo é sobre a quantidade REAL entregue (bonusQty,
  // ex.: 4000 no tier "1000"), não o número mostrado ao cliente — é
  // assim que createOrder já calcula (deliverQty). Margem ~68% em todos.
  "instagram.visualizacoes_reels_bonus.0": 455,
  "instagram.visualizacoes_reels_bonus.1": 455,
  "instagram.visualizacoes_reels_bonus.2": 455,
  "instagram.visualizacoes_reels_bonus.3": 455,
  "instagram.visualizacoes_reels_bonus.4": 455,

  // ---- 👁️ Visualizações no Story (todos os tiers) ----
  // id 698 "Visualização de Story | Todas os Story GARANTIDO" — R$0,80/1.000
  // Margem entre 68% (10.000) e 84% (1.000).
  "instagram.visualizacoes_story.0": 698,
  "instagram.visualizacoes_story.1": 698,
  "instagram.visualizacoes_story.2": 698,
  "instagram.visualizacoes_story.3": 698,
  "instagram.visualizacoes_story.4": 698,

  // ---- 🎬 Visualizações Reels — Mais Alcance + Impressões (todos os tiers) ----
  // id 897 "Visualização Reels + Alcance + Impressões" — R$0,41/1.000 (match exato de nome)
  // Margem entre 73% (10.000) e 79% (1.000).
  "instagram.visualizacoes_reels_alcance.0": 897,
  "instagram.visualizacoes_reels_alcance.1": 897,
  "instagram.visualizacoes_reels_alcance.2": 897,
  "instagram.visualizacoes_reels_alcance.3": 897,
  "instagram.visualizacoes_reels_alcance.4": 897,

  // ---- 📈 Impressões + Alcance + Visitas no Perfil (todos os tiers) ----
  // id 156 "Impressões + alcance + visitas de perfil | MAX 100K" — R$0,38/1.000 (match exato de nome)
  // Margem entre 75% (10.000) e 81% (1.000).
  "instagram.impressoes_alcance_visitas.0": 156,
  "instagram.impressoes_alcance_visitas.1": 156,
  "instagram.impressoes_alcance_visitas.2": 156,
  "instagram.impressoes_alcance_visitas.3": 156,
  "instagram.impressoes_alcance_visitas.4": 156,

  // ---- 🔄 Compartilhamentos da Postagem (todos os tiers) ----
  // id 1251 "Compartilhamento + Rápido no Instagram" — R$0,74/1.000
  // Margem entre 51% (10.000) e 63% (1.000).
  "instagram.compartilhamentos.0": 1251,
  "instagram.compartilhamentos.1": 1251,
  "instagram.compartilhamentos.2": 1251,
  "instagram.compartilhamentos.3": 1251,
  "instagram.compartilhamentos.4": 1251,
};

function getExternalServiceId(platform, groupKey, tierIndex) {
  const key = `${platform}.${groupKey}.${Number(tierIndex)}`;
  return Object.prototype.hasOwnProperty.call(externalServiceMap, key)
    ? externalServiceMap[key]
    : null;
}

module.exports = { externalServiceMap, getExternalServiceId };
