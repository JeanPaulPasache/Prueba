import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  PanResponder,
  LayoutChangeEvent,
} from 'react-native';
import TrackPlayer, {
  usePlaybackState,
  useProgress,
  useActiveTrack,
  State,
  RepeatMode,
  Track,
} from 'react-native-track-player';

interface Props {
  visible: boolean;
  onClose: () => void;
}

// Fisher-Yates: shuffle uniforme, a diferencia de sort(() => Math.random() - 0.5)
function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export default function NowPlayingScreen({ visible, onClose }: Props) {
  const playbackState = usePlaybackState();
  const progress = useProgress();
  const activeTrack = useActiveTrack();

  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState(0);
  const [sliderWidth, setSliderWidth] = useState(0);

  const [repeatMode, setRepeatMode] = useState<RepeatMode>(RepeatMode.Off);
  const [isShuffle, setIsShuffle] = useState<boolean>(false);
  const [originalQueue, setOriginalQueue] = useState<Track[]>([]);

  const [lastSeekTarget, setLastSeekTarget] = useState<number | null>(null);

  // Referencia al timeout de seguridad para poder cancelarlo si arranca
  // un nuevo gesto o si el componente se desmonta con uno pendiente.
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSafetyTimeout = () => {
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
  };

  // Sincronizamos el estado local con el estado real del player al montar,
  // para que la UI no mienta si repeat/shuffle ya estaban activados.
  useEffect(() => {
    (async () => {
      try {
        const currentRepeatMode = await TrackPlayer.getRepeatMode();
        setRepeatMode(currentRepeatMode);
      } catch (err) {
        console.log('Error leyendo repeat mode inicial:', err);
      }
    })();
  }, []);

  useEffect(() => {
    return () => clearSafetyTimeout();
  }, []);

  useEffect(() => {
    if (lastSeekTarget !== null) {
      const diff = Math.abs(progress.position - lastSeekTarget);
      if (diff < 1.5) {
        setLastSeekTarget(null);
        setIsDragging(false);
      }
    }
  }, [progress.position, lastSeekTarget]);

  const durationRef = useRef(progress.duration);
  durationRef.current = progress.duration;

  const sliderWidthRef = useRef(sliderWidth);
  sliderWidthRef.current = sliderWidth;

  const handleCalculateSeek = (locationX: number) => {
    if (sliderWidthRef.current <= 0) return 0;
    const ratio = Math.max(0, Math.min(locationX / sliderWidthRef.current, 1));
    return ratio * durationRef.current;
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        clearSafetyTimeout();
        setIsDragging(true);
        const newPos = handleCalculateSeek(evt.nativeEvent.locationX);
        setDragPosition(newPos);
      },
      onPanResponderMove: (evt) => {
        const newPos = handleCalculateSeek(evt.nativeEvent.locationX);
        setDragPosition(newPos);
      },
      onPanResponderRelease: async (evt) => {
        const finalPos = handleCalculateSeek(evt.nativeEvent.locationX);
        setDragPosition(finalPos);
        setLastSeekTarget(finalPos); // Activamos el candado con la posición final

        try {
          await TrackPlayer.seekTo(Math.floor(finalPos));
        } catch (err) {
          console.log('Error ejecutando seekTo:', err);
        }

        // Timer de seguridad por si el audio falla o tarda demasiado
        clearSafetyTimeout();
        safetyTimeoutRef.current = setTimeout(() => {
          setLastSeekTarget(null);
          setIsDragging(false);
          safetyTimeoutRef.current = null;
        }, 1500);
      },
      onPanResponderTerminate: () => {
        clearSafetyTimeout();
        setIsDragging(false);
        setLastSeekTarget(null);
      },
    })
  ).current;

  // --- LÓGICA DE REPEAT ---
  const toggleRepeatMode = async () => {
    let nextMode = RepeatMode.Off;
    if (repeatMode === RepeatMode.Off) nextMode = RepeatMode.Queue;
    else if (repeatMode === RepeatMode.Queue) nextMode = RepeatMode.Track;
    else if (repeatMode === RepeatMode.Track) nextMode = RepeatMode.Off;

    await TrackPlayer.setRepeatMode(nextMode);
    setRepeatMode(nextMode);
  };

  const toggleShuffle = async () => {
    const currentQueue = await TrackPlayer.getQueue();
    const activeIndex = await TrackPlayer.getActiveTrackIndex();

    if (!isShuffle) {
      // Guardar cola original para poder restaurarla al desactivar Shuffle
      setOriginalQueue(currentQueue);

      if (activeIndex !== undefined && currentQueue.length > 0) {
        const currentQueueTrack = currentQueue[activeIndex];
        const otherTracks = currentQueue.filter((_, idx) => idx !== activeIndex);

        // Mezclar las canciones restantes sin interrumpir la actual
        const shuffled = shuffleArray(otherTracks);
        await TrackPlayer.setQueue([currentQueueTrack, ...shuffled]);
      }
      setIsShuffle(true);
    } else {
      // Restaurar el orden original
      if (originalQueue.length > 0) {
        const currentActiveTrack = await TrackPlayer.getActiveTrack();
        await TrackPlayer.setQueue(originalQueue);

        if (currentActiveTrack) {
          const newIndex = originalQueue.findIndex((t) => t.id === currentActiveTrack.id);
          if (newIndex !== -1) await TrackPlayer.skip(newIndex);
        }
      }
      setIsShuffle(false);
    }
  };

  const isPlaying = playbackState.state === State.Playing;

  const togglePlayback = async () => {
    isPlaying ? await TrackPlayer.pause() : await TrackPlayer.play();
  };

  const isSeeking = isDragging || lastSeekTarget !== null;
  const currentPosition = isSeeking ? dragPosition : progress.position;

  const duration = progress.duration > 0 ? progress.duration : 1;
  const percentage = Math.min(Math.max((currentPosition / duration) * 100, 0), 100);

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const getRepeatIcon = () => {
    switch (repeatMode) {
      case RepeatMode.Track: return '🔂';
      case RepeatMode.Queue: return '🔁';
      default: return '➡️';
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeText}>⌄ Cerrar</Text>
        </TouchableOpacity>

        <View style={styles.artworkPlaceholder}>
          <Text style={{ fontSize: 60 }}>🎵</Text>
        </View>

        <Text style={styles.title} numberOfLines={2}>
          {activeTrack?.title ?? 'Sin reproducción'}
        </Text>
        <Text style={styles.artist}>{activeTrack?.artist ?? ''}</Text>

        {/* --- ÁREA TÁCTIL DEL SLIDER --- */}
        <View
          style={styles.sliderTouchArea}
          onLayout={(e: LayoutChangeEvent) => setSliderWidth(e.nativeEvent.layout.width)}
          {...panResponder.panHandlers}
        >
          {/* pointerEvents="none" evita que toques internos descalibren las coordenadas X */}
          <View style={styles.trackBackground} pointerEvents="none">
            <View style={[styles.trackFill, { width: `${percentage}%` }]} />
            <View style={[styles.thumb, { left: `${percentage}%` }]} />
          </View>
        </View>

        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{formatTime(currentPosition)}</Text>
          <Text style={styles.timeText}>{formatTime(progress.duration)}</Text>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity onPress={() => TrackPlayer.skipToPrevious()}>
            <Text style={styles.controlIcon}>⏮</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={togglePlayback} style={styles.playButton}>
            <Text style={styles.controlIcon}>{isPlaying ? '⏸' : '▶️'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => TrackPlayer.skipToNext()}>
            <Text style={styles.controlIcon}>⏭</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={toggleRepeatMode}>
            <Text style={[styles.secondaryIcon, repeatMode !== RepeatMode.Off && styles.activeIcon]}>
              {getRepeatIcon()}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={toggleShuffle}>
            <Text style={[styles.secondaryIcon, isShuffle && styles.activeIcon]}>🔀</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 24, paddingTop: 60, alignItems: 'center' },
  closeButton: { alignSelf: 'flex-start', marginBottom: 30 },
  closeText: { color: '#aaa', fontSize: 14 },
  artworkPlaceholder: {
    width: 220,
    height: 220,
    borderRadius: 12,
    backgroundColor: '#1e1e1e',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  title: { color: '#fff', fontSize: 20, fontWeight: 'bold', textAlign: 'center' },
  artist: { color: '#aaa', fontSize: 14, marginTop: 4 },
  sliderTouchArea: {
    width: '100%',
    height: 40,
    justifyContent: 'center',
    marginTop: 20,
  },
  trackBackground: {
    width: '100%',
    height: 6,
    backgroundColor: '#333',
    borderRadius: 3,
    justifyContent: 'center',
  },
  trackFill: {
    height: '100%',
    backgroundColor: '#0088cc',
    borderRadius: 3,
  },
  thumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#0088cc',
    marginLeft: -10,
  },
  timeRow: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  timeText: { color: '#aaa', fontSize: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', marginTop: 40, gap: 30 },
  controlIcon: { fontSize: 32, color: '#fff' },
  activeIcon: { opacity: 1 },
  secondaryIcon: { fontSize: 22, opacity: 0.3 },
  playButton: { marginHorizontal: 20 },
});
