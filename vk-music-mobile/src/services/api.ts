import * as FileSystem from 'expo-file-system/legacy';
import { parseTrackTitle } from './parseTrackFile'; 

const API_BASE_URL = 'https://prueba-g46s.onrender.com';
export interface TrackSearchResult {
  index: number;
  title: string;
  duration: string;
}
 
export interface LocalTrack {
  id: string;
  title: string;
  /** Artista parseado del título crudo, '' si no se pudo separar. */
  artist: string;
  /** Título limpio (sin artista ni ruido tipo "(Official Video)"), usado para buscar letras. */
  songTitle: string;
  fileName: string;
  localUri: string;
  downloadedAt: Date;
}

export const searchTracks = async (query: string): Promise<TrackSearchResult[]> => {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    throw new Error('Ingresa un término de búsqueda.');
  }

  const response = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(cleanQuery)}`);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Error al buscar canciones.');
  }

  const results: TrackSearchResult[] = await response.json();
  return results;
};

// Solo caracteres que realmente rompen un nombre de archivo. A propósito NO
// se restringe a ASCII: los títulos de VK suelen venir en cirílico y con el
// regex anterior (`[^a-zA-Z0-9\s-]`) se perdía el nombre por completo.
const sanitizeFileName = (name: string): string =>
  name
    .replace(/[\\/:*?"<>|]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 80);

export const downloadTrackToDevice = async (
  query: string,
  trackIndex: number,
  trackTitle?: string,
  onProgress?: (fraction: number) => void
): Promise<LocalTrack> => {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    throw new Error('El término de búsqueda no puede estar vacío.');
  }
 
  // A) Solicitar únicamente la URL directa a Render (Uso de ancho de banda en Render: ~1 KB)
  const urlResponse = await fetch(
    `${API_BASE_URL}/get-track-url?q=${encodeURIComponent(cleanQuery)}&index=${trackIndex}`
  );
 
  if (!urlResponse.ok) {
    const errorData = await urlResponse.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Error al obtener el enlace de descarga.');
  }
 
  const { url: directAudioUrl, title: fetchedTitle } = await urlResponse.json();
 
  // B) Preparar el nombre del archivo local
  const displayTitle = trackTitle || fetchedTitle || cleanQuery;
  const sanitizedName = sanitizeFileName(displayTitle) || `track_${trackIndex}`;
  const fileName = `${sanitizedName}_${Date.now()}.mp3`;
  const fileUri = `${FileSystem.documentDirectory}${fileName}`;
 
  try {
    const downloadResumable = FileSystem.createDownloadResumable(
      directAudioUrl,
      fileUri,
      {},
      onProgress
        ? (progress) => {
            const fraction =
              progress.totalBytesExpectedToWrite > 0
                ? progress.totalBytesWritten / progress.totalBytesExpectedToWrite
                : 0;
            onProgress(fraction);
          }
        : undefined
    );
 
    const downloadResult = await downloadResumable.downloadAsync();
 
    if (!downloadResult || downloadResult.status !== 200) {
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
      throw new Error(`Error en la descarga directa (Código HTTP ${downloadResult?.status ?? 'desconocido'}).`);
    }
 
    const { artist, title: songTitle } = parseTrackTitle(displayTitle);
 
    return {
      id: Date.now().toString(),
      title: displayTitle,
      artist,
      songTitle,
      fileName,
      localUri: downloadResult.uri,
      downloadedAt: new Date(),
    };
  } catch (error: any) {
    console.error('[DOWNLOAD ERROR]:', error);
    // Si algo falló a mitad de camino, no dejamos un archivo parcial huérfano.
    await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
    throw new Error(error.message || 'Error al descargar la canción.');
  }
};
 

export const fetchLyricsApi = async (
  trackName: string,
  artistName: string = '',
  duration: number = 0,
  translate: boolean = true
) => {
  const queryParams = new URLSearchParams({
    track_name: trackName,
    artist_name: artistName,
    duration: duration.toString(),
    translate: translate ? 'true' : 'false',
  });

  // Reemplaza BASE_URL por la variable donde tengas la URL de tu backend
  const response = await fetch(`${API_BASE_URL}/get-lyrics?${queryParams.toString()}`);
  
  if (!response.ok) {
    throw new Error('No se pudieron obtener las letras');
  }

  return await response.json();
};