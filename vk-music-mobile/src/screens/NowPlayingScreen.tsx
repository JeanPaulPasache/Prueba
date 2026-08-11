import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  PanResponder,
  LayoutChangeEvent,
  ActivityIndicator,
} from 'react-native';
import TrackPlayer, {
  usePlaybackState,
  useProgress,
  useActiveTrack,
  State,
  RepeatMode,
  Track,
} from 'react-native-track-player';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 1. IMPORTANTE: Importar el helper del parser, el componente visual y la función de tu api.ts
import { LyricsViewer } from './LyricsViewer'; // Ajusta la ruta si la tienes en otra carpeta
import { parseLrcWithTranslation, LyricLine } from '../utils/parseLrc';
import { fetchLyricsApi } from '../services/api'; // Reemplaza por la ruta de tu api.ts

interface Props {
  visible: boolean;
  onClose: () => void;
}

// Fisher-Yates: shuffle uniforme
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

  // --- ESTADOS PARA LETRAS Y CACHÉ ---
  const [showLyrics, setShowLyrics] = useState<boolean>(false);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [loadingLyrics, setLoadingLyrics] = useState<boolean>(false);
  const [showTranslation, setShowTranslation] = useState<boolean>(true);

  // Referencia al timeout de seguridad para la barra de progreso
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSafetyTimeout = () => {
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
  };

  // 2. Limpiar/Resetear el estado de las letras cuando cambie la canción activa
  useEffect(() => {
    setLyrics([]);
    setShowLyrics(false);
  }, [activeTrack?.id, activeTrack?.title]);

  // Sincronizamos el estado local con el estado real del player al montar
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
        setLastSeekTarget(finalPos);

        try {
          await TrackPlayer.seekTo(Math.floor(finalPos));
        } catch (err) {
          console.log('Error ejecutando seekTo:', err);
        }

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

  // --- LÓGICA DE LETRAS CON CACHÉ (ASYNCSTORAGE) ---
  const handleToggleLyrics = async () => {
    // Si ya se están mostrando, simplemente ocultar
    if (showLyrics) {
      setShowLyrics(false);
      return;
    }

    setShowLyrics(true);

    if (!activeTrack?.title) return;

    // Si ya tenemos letras cargadas previamente en memoria para esta canción, no volvemos a consultar
    if (lyrics.length > 0) return;

    setLoadingLyrics(true);
    const cacheKey = `lyrics_${activeTrack.id || `${activeTrack.title}_${activeTrack.artist}`}`;

    try {
      // 1. Buscar en almacenamiento local primero (AsyncStorage)
      const cachedData = await AsyncStorage.getItem(cacheKey);

      if (cachedData) {
        console.log('Letras cargadas desde la memoria local');
        const { syncedLyrics, translatedLyrics } = JSON.parse(cachedData);
        const parsed = parseLrcWithTranslation(syncedLyrics, translatedLyrics);
        setLyrics(parsed);
        setLoadingLyrics(false);
        return;
      }

      // 2. Si no está en caché local, pedir a la API
      console.log('Consultando letras al backend...');
      const data = await fetchLyricsApi(
        activeTrack.title,
        activeTrack.artist || '',
        Math.floor(progress.duration || 0),
        true // Solicitar traducción
      );

      if (data && data.syncedLyrics) {
        // 3. Guardar en AsyncStorage para uso futuro u offline
        await AsyncStorage.setItem(
          cacheKey,
          JSON.stringify({
            syncedLyrics: data.syncedLyrics,
            translatedLyrics: data.translatedLyrics,
          })
        );

        const parsed = parseLrcWithTranslation(data.syncedLyrics, data.translatedLyrics);
        setLyrics(parsed);
      } else {
        setLyrics([]);
      }
    } catch (error) {
      console.log('Error obteniendo letras:', error);
      setLyrics([]);
    } finally {
      setLoadingLyrics(false);
    }
  };

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
      setOriginalQueue(currentQueue);

      if (activeIndex !== undefined && currentQueue.length > 0) {
        const currentQueueTrack = currentQueue[activeIndex];
        const otherTracks = currentQueue.filter((_, idx) => idx !== activeIndex);

        const shuffled = shuffleArray(otherTracks);
        await TrackPlayer.setQueue([currentQueueTrack, ...shuffled]);
      }
      setIsShuffle(true);
    } else {
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

        {/* --- ÁREA CENTRAL: CARÁTULA O LETRAS --- */}
        <View style={styles.artworkPlaceholder}>
          {showLyrics ? (
            loadingLyrics ? (
              <ActivityIndicator size="large" color="#0088cc" />
            ) : (
              <LyricsViewer
                lyrics={lyrics}
                currentTimeSeconds={progress.position}
                showTranslation={showTranslation}
              />
            )
          ) : (
            <Text style={{ fontSize: 60 }}>🎵</Text>
          )}
        </View>

        <Text style={styles.title} numberOfLines={2}>
          {activeTrack?.title ?? 'Sin reproducción'}
        </Text>
        <Text style={styles.artist}>{activeTrack?.artist ?? ''}</Text>

        {/* --- BARRA DE ACCIÓN (LETRA / TRADUCCIÓN) --- */}
        <View style={styles.lyricsActionRow}>
          <TouchableOpacity
            style={[styles.lyricsButton, showLyrics && styles.activeLyricsButton]}
            onPress={handleToggleLyrics}
          >
            <Text style={styles.lyricsButtonText}>
              {showLyrics ? '🖼️ Carátula' : '🎤 Cargar Letras'}
            </Text>
          </TouchableOpacity>

          {showLyrics && lyrics.length > 0 && (
            <TouchableOpacity
              style={[styles.lyricsButton, showTranslation && styles.activeLyricsButton]}
              onPress={() => setShowTranslation(!showTranslation)}
            >
              <Text style={styles.lyricsButtonText}>🌐 Traducir</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* --- ÁREA TÁCTIL DEL SLIDER --- */}
        <View
          style={styles.sliderTouchArea}
          onLayout={(e: LayoutChangeEvent) => setSliderWidth(e.nativeEvent.layout.width)}
          {...panResponder.panHandlers}
        >
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
  closeButton: { alignSelf: 'flex-start', marginBottom: 20 },
  closeText: { color: '#aaa', fontSize: 14 },
  artworkPlaceholder: {
    width: 260,
    height: 260,
    borderRadius: 12,
    backgroundColor: '#1e1e1e',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    overflow: 'hidden', // Asegura que las letras no sobresalgan del marco
  },
  title: { color: '#fff', fontSize: 20, fontWeight: 'bold', textAlign: 'center' },
  artist: { color: '#aaa', fontSize: 14, marginTop: 4 },
  lyricsActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    marginBottom: 4,
  },
  lyricsButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#262626',
  },
  activeLyricsButton: {
    backgroundColor: '#0088cc',
  },
  lyricsButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  sliderTouchArea: {
    width: '100%',
    height: 40,
    justifyContent: 'center',
    marginTop: 10,
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
  controls: { flexDirection: 'row', alignItems: 'center', marginTop: 25, gap: 30 },
  controlIcon: { fontSize: 32, color: '#fff' },
  activeIcon: { opacity: 1 },
  secondaryIcon: { fontSize: 22, opacity: 0.3 },
  playButton: { marginHorizontal: 20 },
});