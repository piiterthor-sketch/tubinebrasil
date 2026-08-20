// =========================================================
// FONTE DE VERDADE DOS PREÇOS (SERVIDOR)
// -----------------------------------------------------------
// Cópia fiel do objeto `catalog` que existe em index.html.
// A partir de agora, este arquivo — não o do navegador — é quem
// decide o preço/quantidade real de cada pedido, porque roda na
// Cloud Function createOrder (Admin SDK), fora do alcance do
// cliente.
//
// !! IMPORTANTE !!
// Sempre que você alterar um preço/pacote no `catalog` dentro do
// <script> de index.html, replique a MESMA alteração aqui e rode
// `firebase deploy --only functions` de novo. Os dois arquivos
// precisam ficar idênticos — o do index.html é só para exibição,
// este aqui é quem manda de verdade.
// =========================================================
const catalog = {
  instagram: {
    label: "Instagram",
    groups: {
      seguidores_br_baixa: {
        label: "🇧🇷 Seguidores BR — Baixa Qualidade",
        tiers: [
          { qty: 100, price: 2.99 },
          { qty: 300, price: 4.99 },
          { qty: 500, price: 7.99 },
          { qty: 1000, price: 12.99 },
        ],
      },
      seguidores_br_alta: {
        label: "🇧🇷 Seguidores BR — Alta Qualidade / Orgânicos",
        tiers: [
          { qty: 100, price: 19.99 },
          { qty: 300, price: 29.99 },
          { qty: 500, price: 79.99 },
          { qty: 1000, price: 149.99 },
        ],
      },
      curtidas_mundiais: {
        label: "❤️ Curtidas Mundiais",
        tiers: [
          { qty: 100, price: 0.99 },
          { qty: 200, price: 1.99 },
          { qty: 300, price: 2.99 },
          { qty: 500, price: 4.99 },
          { qty: 1000, price: 9.99 },
        ],
      },
      seguidores_mundiais: {
        label: "Seguidores Mundiais",
        tiers: [
          { qty: 100, price: 0.99 },
          { qty: 200, price: 1.99 },
          { qty: 300, price: 2.99 },
          { qty: 500, price: 4.99 },
          { qty: 1000, price: 9.99 },
          { qty: 2000, price: 19.99 },
          { qty: 5000, price: 49.99 },
          { qty: 10000, price: 99.99 },
        ],
      },
      curtidas_br_baixa: {
        label: "🇧🇷 Curtidas BR — Baixa Qualidade",
        tiers: [
          { qty: 100, price: 2.99 },
          { qty: 300, price: 4.99 },
          { qty: 500, price: 7.99 },
          { qty: 1000, price: 12.99 },
        ],
      },
      curtidas_br_alta: {
        label: "🇧🇷 Curtidas BR — Alta Qualidade",
        tiers: [
          { qty: 100, price: 4.99 },
          { qty: 300, price: 7.99 },
          { qty: 500, price: 11.99 },
        ],
      },
      curtidas_mulheres_br: {
        label: "🙋‍♀️ Curtidas Mulheres BR — Baixa Qualidade",
        tiers: [
          { qty: 100, price: 2.99 },
          { qty: 300, price: 4.99 },
          { qty: 500, price: 7.99 },
          { qty: 1000, price: 12.99 },
        ],
      },
      curtidas_homens_br: {
        label: "🙋‍♂️ Curtidas Homens BR — Baixa Qualidade",
        tiers: [
          { qty: 100, price: 2.99 },
          { qty: 300, price: 4.99 },
          { qty: 500, price: 7.99 },
          { qty: 1000, price: 12.99 },
        ],
      },
      comentarios_unissex: {
        label: "💬 Comentários Unissex",
        commentsInput: true,
        tiers: [
          { qty: 10, price: 9.99 },
          { qty: 20, price: 14.99 },
          { qty: 30, price: 19.99 },
          { qty: 40, price: 24.99 },
          { qty: 50, price: 29.99 },
        ],
      },
      comentarios_mulheres: {
        label: "💬 Comentários — Mulheres",
        commentsInput: true,
        tiers: [
          { qty: 10, price: 15.99 },
          { qty: 20, price: 24.99 },
          { qty: 30, price: 34.99 },
          { qty: 40, price: 44.99 },
          { qty: 50, price: 54.99 },
        ],
      },
      comentarios_homens: {
        label: "💬 Comentários — Homens",
        commentsInput: true,
        tiers: [
          { qty: 10, price: 15.99 },
          { qty: 20, price: 24.99 },
          { qty: 30, price: 34.99 },
          { qty: 40, price: 44.99 },
          { qty: 50, price: 54.99 },
        ],
      },
      visualizacoes_reels_bonus: {
        label: "🎬 Visualizações no Reels — +300% de Bônus",
        tiers: [
          { qty: 1000, price: 1.49, bonusQty: 4000 },
          { qty: 2000, price: 2.99, bonusQty: 8000 },
          { qty: 3000, price: 4.49, bonusQty: 12000 },
          { qty: 5000, price: 7.49, bonusQty: 20000 },
          { qty: 10000, price: 14.99, bonusQty: 40000 },
        ],
      },
      visualizacoes_story: {
        label: "👁️ Visualizações no Story",
        tiers: [
          { qty: 1000, price: 4.99 },
          { qty: 2000, price: 7.99 },
          { qty: 3000, price: 10.99 },
          { qty: 5000, price: 14.99 },
          { qty: 10000, price: 24.99 },
        ],
      },
      visualizacoes_reels_alcance: {
        label: "🎬 Visualizações Reels — Mais Alcance + Impressões",
        tiers: [
          { qty: 1000, price: 1.99 },
          { qty: 2000, price: 3.49 },
          { qty: 3000, price: 4.99 },
          { qty: 5000, price: 7.99 },
          { qty: 10000, price: 14.99 },
        ],
      },
      impressoes_alcance_visitas: {
        label: "📈 Impressões + Alcance + Visitas no Perfil",
        tiers: [
          { qty: 1000, price: 1.99 },
          { qty: 2000, price: 3.49 },
          { qty: 3000, price: 4.99 },
          { qty: 5000, price: 7.99 },
          { qty: 10000, price: 14.99 },
        ],
      },
      compartilhamentos: {
        label: "🔄 Compartilhamentos da Postagem",
        tiers: [
          { qty: 1000, price: 1.99 },
          { qty: 2000, price: 3.49 },
          { qty: 3000, price: 4.99 },
          { qty: 5000, price: 7.99 },
          { qty: 10000, price: 14.99 },
        ],
      },
    },
  },
  tiktok: {
    label: "TikTok",
    groups: {
      seguidores: {
        label: "🎵 Seguidores TikTok",
        tiers: [
          { qty: 100, price: 4.99 },
          { qty: 300, price: 9.99 },
          { qty: 500, price: 14.99 },
          { qty: 1000, price: 24.99 },
          { qty: 2000, price: 39.99 },
          { qty: 5000, price: 79.99 },
          { qty: 10000, price: 129.99 },
        ],
      },
      seguidores_br: {
        label: "🇧🇷 Seguidores BR — TikTok",
        tiers: [
          { qty: 100, price: 9.99 },
          { qty: 300, price: 19.99 },
          { qty: 500, price: 29.99 },
          { qty: 1000, price: 49.99 },
          { qty: 2000, price: 69.99 },
          { qty: 3000, price: 89.99 },
          { qty: 5000, price: 129.99 },
          { qty: 10000, price: 199.99 },
        ],
      },
      curtidas: {
        label: "🎵 Curtidas TikTok",
        tiers: [
          { qty: 100, price: 1.99 },
          { qty: 300, price: 3.99 },
          { qty: 500, price: 5.99 },
          { qty: 1000, price: 9.99 },
          { qty: 2000, price: 14.99 },
          { qty: 5000, price: 29.99 },
          { qty: 10000, price: 49.99 },
        ],
      },
      visualizacoes: {
        label: "🎵 Visualizações TikTok",
        tiers: [
          { qty: 1000, price: 1.99 },
          { qty: 2000, price: 3.99 },
          { qty: 3000, price: 5.99 },
          { qty: 5000, price: 9.99 },
          { qty: 10000, price: 19.99 },
        ],
      },
      compartilhamentos: {
        label: "🎵 Compartilhamentos TikTok",
        tiers: [
          { qty: 1000, price: 1.99 },
          { qty: 2000, price: 3.99 },
          { qty: 3000, price: 5.99 },
          { qty: 5000, price: 9.99 },
          { qty: 10000, price: 19.99 },
        ],
      },
    },
  },
};

module.exports = { catalog };
