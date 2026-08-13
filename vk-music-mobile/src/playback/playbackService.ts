import TrackPlayer, { Event } from 'react-native-track-player';

export const PlaybackService = async function () {
  TrackPlayer.addEventListener(Event.RemotePlay, async () => {
    try {
      await TrackPlayer.play();
    } catch (e) {
      console.log('Error en RemotePlay:', e);
    }
  });

  TrackPlayer.addEventListener(Event.RemotePause, async () => {
    try {
      await TrackPlayer.pause();
    } catch (e) {
      console.log('Error en RemotePause:', e);
    }
  });

  TrackPlayer.addEventListener(Event.RemoteStop, async () => {
    try {
      await TrackPlayer.stop();
    } catch (e) {
      console.log('Error en RemoteStop:', e);
    }
  });

  TrackPlayer.addEventListener(Event.RemoteNext, async () => {
    try {
      await TrackPlayer.skipToNext();
    } catch (e) {
      console.log('Error en RemoteNext:', e);
    }
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, async () => {
    try {
      await TrackPlayer.skipToPrevious();
    } catch (e) {
      console.log('Error en RemotePrevious:', e);
    }
  });

  TrackPlayer.addEventListener(Event.RemoteSeek, async (event) => {
    try {
      if (event.position !== undefined && event.position !== null) {
        // Redondear para evitar rechazos en el reproductor nativo de Android
        await TrackPlayer.seekTo(Math.floor(event.position));
      }
    } catch (e) {
      console.log('Error en RemoteSeek:', e);
    }
  });

  TrackPlayer.addEventListener(Event.RemoteDuck, async (event) => {
    const { paused, permanent } = event;

    if (permanent) {
      // Interrupción permanente (ej. otra app tomó el audio por completo)
      await TrackPlayer.pause();
    } else if (paused) {
      // Se desconectaron los auriculares o entró una llamada/notificación
      await TrackPlayer.pause();
    } else {
      // La interrupción terminó (ej. colgaste la llamada). 
      // Opcional: Reanudar la música automáticamente
      await TrackPlayer.play();
    }
  });

  TrackPlayer.addEventListener(Event.PlaybackError, (error) => {
    console.warn('[TrackPlayer] Error de reproducción:', error);
  });
};