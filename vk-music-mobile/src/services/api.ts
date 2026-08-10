import * as FileSystem from 'expo-file-system/legacy';

// Reemplaza esta constante con la URL real asignada por Render
export const API_BASE_URL = 'https://prueba-g46s.onrender.com';

export interface LocalTrack {
  id: string;
  title: string;
  fileName: string;
  localUri: string;
  downloadedAt: Date;
}

export const downloadTrackToDevice = async (query: string): Promise<LocalTrack> => {
  const cleanQuery = query.trim();

  if (!cleanQuery) {
    throw new Error('El nombre de la canción no puede estar vacío.');
  }

  const encodedQuery = encodeURIComponent(cleanQuery);
  const downloadUrl = `${API_BASE_URL}/download-track?q=${encodedQuery}`;

  const sanitizedName = cleanQuery.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_');
  const fileName = `${sanitizedName}_${Date.now()}.mp3`;
  const fileUri = `${FileSystem.documentDirectory}${fileName}`;

  try {
    // Usamos createDownloadResumable para evitar la firma deprecada
    const downloadResumable = FileSystem.createDownloadResumable(
      downloadUrl,
      fileUri
    );

    const downloadResult = await downloadResumable.downloadAsync();

    if (!downloadResult || downloadResult.status !== 200) {
      await FileSystem.deleteAsync(fileUri, { idempotent: true });

      if (downloadResult?.status === 404) {
        throw new Error('No se encontró el audio o el bot de Telegram no respondió a tiempo.');
      } else if (downloadResult?.status === 400) {
        throw new Error('El parámetro de búsqueda no es válido.');
      } else {
        throw new Error(`Error en el servidor backend (Código ${downloadResult?.status ?? 'desconocido'}).`);
      }
    }

    return {
      id: Date.now().toString(),
      title: cleanQuery,
      fileName,
      localUri: downloadResult.uri,
      downloadedAt: new Date(),
    };
  } catch (error: any) {
    console.error('[API DOWNLOAD ERROR]:', error);
    throw new Error(error.message || 'Ocurrió un fallo al conectar con el servidor.');
  }
};