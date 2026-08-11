export interface ParsedTrackInfo {
  /** Artista extraído, o '' si no se pudo separar del título. */
  artist: string;
  /** Título limpio, sin ruido de (Official Video), [Remastered 2011], feat., etc. */
  title: string;
  /** Título tal cual vino del bot, sin ningún procesamiento. Útil para mostrar o depurar. */
  rawTitle: string;
}
 
// Paréntesis o corchetes con ruido típico de plataformas de música:
// "(Official Video)", "[Remastered 2011]", "(feat. Otro Artista)", etc.
const EXTRA_INFO_PATTERN =
  /\s*[([][^)\]]*(?:remaster|remix|mix|version|edit|live|acoustic|cover|feat\.?|ft\.?|official|video|audio|lyric|explicit|mono|stereo|\d{4})[^)\]]*[)\]]\s*/gi;
 
// Sufijos sueltos con guion (sin paréntesis) tipo "Artist - Song - Extended Mix".
// Solo corta si el sufijo entero es una palabra conocida de este tipo, para no
// arriesgarse a mutilar un título que legítimamente tenga un guion.
const TRAILING_MIX_PATTERN =
  /\s*[-–—]\s*(?:official\s+)?(?:extended|radio|club|album|original|remastered?|remix(?:ed)?|edit|version|mix)(?:\s+(?:mix|edit|version))?\s*$/i;
 
// El bot de VK devuelve títulos tipo "Artista – Canción 4:24 10.3M 327k":
// duración (mm:ss o h:mm:ss) seguida de una o más cifras de vistas/descargas
// con sufijo K/M/B. Esto va pegado al final del título, no del artista.
const TRAILING_STATS_PATTERN =
  /\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s+\d+(?:[.,]\d+)?[kmb])*\s*$/i;
 
const stripNoise = (value: string): string =>
  value
    .replace(EXTRA_INFO_PATTERN, ' ')
    .replace(TRAILING_STATS_PATTERN, '')
    .replace(TRAILING_MIX_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim();
 
/**
 * Separa "Artista - Título (extra)" en sus partes, para poder buscar letras
 * sincronizadas (LRCLIB, Musixmatch, etc.) con campos artist/title reales
 * en vez de un string único mezclado.
 *
 * Si no encuentra un separador reconocible, devuelve artist: '' y title
 * con el string completo, para que el caller pueda decidir cómo buscar
 * (por ejemplo, buscar solo por título en LRCLIB).
 */
export function parseTrackTitle(rawTitle: string): ParsedTrackInfo {
  const cleaned = rawTitle.trim();
 
  // separadores comunes: guion normal, en dash, em dash o pipe
  const separatorMatch = cleaned.match(/^(.+?)\s*[-–—|]\s*(.+)$/);
 
  let artist = '';
  let title = cleaned;
 
  if (separatorMatch) {
    artist = separatorMatch[1].trim();
    title = separatorMatch[2].trim();
  }
 
  const cleanArtist = stripNoise(artist);
  const cleanTitle = stripNoise(title) || cleaned;
 
  return {
    artist: cleanArtist,
    title: cleanTitle,
    rawTitle: cleaned,
  };
}
 