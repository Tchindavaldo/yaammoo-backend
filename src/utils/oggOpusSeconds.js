// Durée (secondes) d'un fichier Ogg Opus, le format des notes vocales WhatsApp : position
// (granule) de la dernière page, moins le pre-skip de l'en-tête OpusHead, à 48 kHz (fixe en
// Opus). Utilisé par services/whatsapp/ai/voiceNotes.js. Fonction pure, ne lève jamais.

/** @returns {number|null} la durée, ou null si ce n'est pas de l'Ogg Opus lisible */
module.exports = buf => {
  if (!Buffer.isBuffer(buf) || buf.length < 47 || buf.toString('latin1', 0, 4) !== 'OggS') return null;
  const head = buf.indexOf('OpusHead', 0, 'latin1');
  if (head < 0 || head + 12 > buf.length) return null;
  const preSkip = buf.readUInt16LE(head + 10);
  // Dernière page dont un paquet se termine (granule -1 = aucun) ; octet de version à 0.
  let pos = buf.length;
  while (pos > 0) {
    pos = buf.lastIndexOf('OggS', pos - 1, 'latin1');
    if (pos < 0) break;
    if (pos + 14 > buf.length || buf[pos + 4] !== 0) continue;
    const granule = buf.readBigInt64LE(pos + 6);
    if (granule >= 0n) return Math.max(0, Number(granule) - preSkip) / 48000;
  }
  return null;
};
