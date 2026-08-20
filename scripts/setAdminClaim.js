// =========================================================
// Migração opcional (item 5.3 do relatório): sair de "admin = um
// e-mail fixo no código" para "admin = custom claim no token do
// Firebase Auth". Isso permite ter mais de um admin no futuro e
// revogar acesso sem reescrever regras/código.
//
// COMO USAR (rode uma única vez, na sua máquina, fora do navegador):
//   1) No Console do Firebase > Configurações do projeto > Contas de
//      serviço > "Gerar nova chave privada" — salve como
//      service-account.json nesta mesma pasta (scripts/).
//      NUNCA suba esse arquivo para o Git/GitHub.
//   2) cd scripts && npm install firebase-admin
//   3) node setAdminClaim.js SEU_UID_DO_FIREBASE_AUTH
//      (o UID aparece em Authentication > Users no Console do Firebase)
//
// Depois de rodar isso, você pode (opcional, mas recomendado) trocar
// isAdmin() em firestore.rules e em functions/index.js de:
//   request.auth.token.email == "piiterthor@gmail.com"
// para:
//   request.auth.token.admin == true
// O usuário precisa deslogar e logar de novo (ou dar refresh no
// token) depois que o claim é atribuído, para o novo token chegar
// com "admin: true".
// =========================================================
const admin = require("firebase-admin");

const uid = process.argv[2];
if (!uid) {
  console.error("Uso: node setAdminClaim.js <UID_DO_USUARIO>");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require("./service-account.json")),
});

admin
  .auth()
  .setCustomUserClaims(uid, { admin: true })
  .then(() => {
    console.log(`OK: usuário ${uid} agora tem o custom claim admin:true.`);
    console.log("Peça para essa pessoa sair e entrar de novo no site (ou dar refresh no login) para o claim valer.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Falhou:", err);
    process.exit(1);
  });
