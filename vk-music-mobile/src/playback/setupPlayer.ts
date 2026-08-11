import TrackPlayer, { Capability, AppKilledPlaybackBehavior } from 'react-native-track-player';
import { LocalTrack } from '../services/api';

let isSetup = false;

/**
 * Inicializa TrackPlayer una sola vez. Llamar en el mount de App.tsx.
 */
export const setupPlayer = async (): Promise<boolean> => {
  if (isSetup) return true;

  try {
    await TrackPlayer.setupPlayer({
      autoHandleInterruptions: true, // pausa/reanuda automáticamente en llamadas, etc.
    });

    await TrackPlayer.updateOptions({
      android: {
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
      },
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
        Capability.Stop,
      ],
      compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SeekTo],
      progressUpdateEventInterval: 1,
    });

    isSetup = true;
    return true;
  } catch (error) {
    console.error('[TrackPlayer] Error al inicializar:', error);
    return false;
  }
};

export const trackFromLocalTrack = (track: LocalTrack) => ({
  id: track.id,
  url: track.localUri,
  title: track.title,
  artist: track.artist,
  artwork: track.localUri,
  duration: track.downloadedAt.getTime(),
  album: track.fileName,
});
