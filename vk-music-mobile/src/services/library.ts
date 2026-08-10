import AsyncStorage from '@react-native-async-storage/async-storage';
import { LocalTrack } from './api';

const LIBRARY_KEY = 'music_library_v1';

/**
 * Devuelve la lista de canciones descargadas y guardadas anteriormente.
 * Esto es lo que persiste entre sesiones (a diferencia de "currentTrack",
 * que solo vive mientras la app está abierta).
 */
export const getLibrary = async (): Promise<LocalTrack[]> => {
  try {
    const raw = await AsyncStorage.getItem(LIBRARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalTrack[];
    // downloadedAt vuelve como string al parsear JSON, lo reconvertimos a Date
    return parsed.map((t) => ({ ...t, downloadedAt: new Date(t.downloadedAt) }));
  } catch (error) {
    console.error('[LIBRARY] Error leyendo biblioteca:', error);
    return [];
  }
};

/**
 * Agrega una canción recién descargada al principio de la biblioteca
 * y persiste el resultado.
 */
export const addToLibrary = async (track: LocalTrack): Promise<LocalTrack[]> => {
  const current = await getLibrary();
  const withoutDup = current.filter((t) => t.id !== track.id);
  const updated = [track, ...withoutDup];
  await AsyncStorage.setItem(LIBRARY_KEY, JSON.stringify(updated));
  return updated;
};

export const removeFromLibrary = async (id: string): Promise<LocalTrack[]> => {
  const current = await getLibrary();
  const updated = current.filter((t) => t.id !== id);
  await AsyncStorage.setItem(LIBRARY_KEY, JSON.stringify(updated));
  return updated;
};
