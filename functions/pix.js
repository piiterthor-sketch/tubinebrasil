// =========================================================
// Geração do payload Pix (BR Code / EMV) — mesma lógica que já
// existia em index.html (buildPixPayload/tag/crc16/normalizePixText),
// só que rodando no servidor, para que o QR/copia-e-cola sempre
// reflita o valor calculado pela Cloud Function, nunca um valor
// vindo do navegador.
// =========================================================
function tag(id, value) {
  return id + String(value.length).padStart(2, "0") + value;
}

function normalizePixText(s) {
  // Remove acentos (marcas diacríticas combinantes, faixa Unicode U+0300–U+036F)
  // e qualquer caractere fora de A-Z/0-9/espaço, exigido pelo padrão BR Code do Pix.
  const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");
  return String(s)
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function buildPixPayload(amount, key, name, city, txid) {
  const merchant = normalizePixText(name).slice(0, 25);
  const mcity = normalizePixText(city).slice(0, 15);
  const k = String(key).trim();
  let payload = "000201010211";
  const gui = "0014BR.GOV.BCB.PIX";
  const keyField = tag("01", k);
  payload += tag("26", gui + keyField);
  payload +=
    tag("52", "0000") +
    tag("53", "986") +
    tag("54", Number(amount).toFixed(2)) +
    tag("58", "BR") +
    tag("59", merchant) +
    tag("60", mcity) +
    tag("62", tag("05", String(txid).slice(0, 25)));
  payload += "6304";
  payload += crc16(payload);
  return payload;
}

module.exports = { buildPixPayload };
