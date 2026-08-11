import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { LocalTrack } from './api';
import TrackPlayer from 'react-native-track-player';
import { Alert } from 'react-native';

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

export const deleteTrack = async (
  trackToDelete: any,
  currentTracks: any[],
  setTracksState: React.Dispatch<React.SetStateAction<any[]>>
) => {
  try {
    // 1. Detener o saltar canción si se está reproduciendo actualmente
    const activeTrack = await TrackPlayer.getActiveTrack();
    if (activeTrack?.id === trackToDelete.id) {
      try {
        await TrackPlayer.skipToNext();
      } catch {
        await TrackPlayer.stop();
      }
    }

    // 2. Quitar la canción de la cola activa de TrackPlayer
    const queue = await TrackPlayer.getQueue();
    const trackIndex = queue.findIndex((t) => t.id === trackToDelete.id);
    if (trackIndex !== -1) {
      await TrackPlayer.remove(trackIndex);
    }

    // 3. Borrar el archivo físico .mp3 del dispositivo
    if (trackToDelete.url && trackToDelete.url.startsWith('file://')) {
      const fileInfo = await FileSystem.getInfoAsync(trackToDelete.url);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(trackToDelete.url, { idempotent: true });
        console.log('Archivo físico eliminado:', trackToDelete.url);
      }
    }

    // 4. Filtrar y guardar la nueva lista en AsyncStorage
    const updatedTracks = currentTracks.filter((track) => track.id !== trackToDelete.id);
    await AsyncStorage.setItem(LIBRARY_KEY, JSON.stringify(updatedTracks));

    // 5. Actualizar el estado de React para que la pantalla se refresque de inmediato
    setTracksState(updatedTracks);

  } catch (error) {
    console.error('Error al eliminar la canción:', error);
    Alert.alert('Error', 'No se pudo eliminar la canción correctamente.');
  }
};