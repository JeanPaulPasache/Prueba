import * as FileSystem from 'expo-file-system/legacy';

// Reemplaza esta constante con la URL real asignada por Render
export const API_BASE_URL = 'https://prueba-g46s.onrender.com';

export interface TrackSearchResult {
  index: number;
  title: string;
  duration: string;
}

export interface LocalTrack {
  id: string;
  title: string;
  fileName: string;
  localUri: string;
  downloadedAt: Date;
}

/**
 * 1. Busca las 10 opciones de canciones disponibles en el bot de Telegram.
 */
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

/**
 * 2. Descarga la canción seleccionada por el usuario en el almacenamiento local.
 */
export const downloadTrackToDevice = async (
  query: string,
  trackIndex: number,
  trackTitle?: string
): Promise<LocalTrack> => {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    throw new Error('El término de búsqueda no puede estar vacío.');
  }

  const downloadUrl = `${API_BASE_URL}/download-track?q=${encodeURIComponent(cleanQuery)}&index=${trackIndex}`;

  // Sanitizar nombre de archivo
  const displayTitle = trackTitle || cleanQuery;
  const sanitizedName = displayTitle.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_');
  const fileName = `${sanitizedName}_${Date.now()}.mp3`;
  const fileUri = `${FileSystem.documentDirectory}${fileName}`;

  try {
    const downloadResumable = FileSystem.createDownloadResumable(downloadUrl, fileUri);
    const downloadResult = await downloadResumable.downloadAsync();

    if (!downloadResult || downloadResult.status !== 200) {
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
      throw new Error(`Error en la descarga (Código HTTP ${downloadResult?.status ?? 'desconocido'}).`);
    }

    return {
      id: Date.now().toString(),
      title: displayTitle,
      fileName,
      localUri: downloadResult.uri,
      downloadedAt: new Date(),
    };
  } catch (error: any) {
    console.error('[DOWNLOAD ERROR]:', error);
    throw new Error(error.message || 'Error al descargar la canción.');
  }
};
