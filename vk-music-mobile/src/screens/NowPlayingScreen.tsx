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
  Image,
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
import { Feather } from '@expo/vector-icons';

if (typeof XMLHttpRequest !== 'undefined' && !XMLHttpRequest.prototype.overrideMimeType) {
  XMLHttpRequest.prototype.overrideMimeType = function () {};
}
const jsmediatags = require('jsmediatags/dist/jsmediatags.min.js');
import { LyricsViewer } from './LyricsViewer';
import { parseLrcWithTranslation, LyricLine } from '../utils/parseLrc';
import { fetchLyricsApi } from '../services/api';
import { colors, spacing, radii, typography } from '../utils/theme';

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

  const [artworkUri, setArtworkUri] = useState<string | null>(null);
  useEffect(() => {
    if(!activeTrack){
      setArtworkUri(null);
      return;
    }
    const fileUri = activeTrack.url;

    if (fileUri) {
      // Usamos fetch() para leer el archivo local file:// como un Blob
      fetch(fileUri)
        .then((response) => response.blob())
        .then((blob) => {
          // Le pasamos el Blob a jsmediatags en lugar de la URL string
          jsmediatags.read(blob, {
            onSuccess: (tag: any) => {
              const picture = tag.tags.picture;
              if (picture) {
                const { data, format } = picture;
                let binary = '';
                for (let i = 0; i < data.length; i++) {
                  binary += String.fromCharCode(data[i]);
                }
                const base64 = typeof btoa !== 'undefined'
                  ? btoa(binary)
                  : global.btoa ? global.btoa(binary) : null;

                if (base64) {
                  setArtworkUri(`data:${format};base64,${base64}`);
                } else {
                  setArtworkUri(null);
                }
              } else {
                setArtworkUri(null);
              }
            },
            onError: (error: any) => {
              console.log('Error procesando el Blob con jsmediatags:', error);
              setArtworkUri(null);
            },
          });
        })
        .catch((err) => {
          console.log('Error leyendo el archivo local con fetch:', err);
          setArtworkUri(null);
        });
    } else {
      setArtworkUri(null);
    }
  }, [activeTrack]);

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

  const repeatIsActive = repeatMode !== RepeatMode.Off;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <TouchableOpacity onPress={onClose} style={styles.closeButton} activeOpacity={0.7}>
          <Feather name="chevron-down" size={16} color={colors.textSecondary} />
          <Text style={styles.closeText}>Cerrar</Text>
        </TouchableOpacity>

        {/* --- ÁREA CENTRAL: CARÁTULA O LETRAS --- */}
        <View style={styles.artworkPlaceholder}>
          {showLyrics ? (
            loadingLyrics ? (
              <ActivityIndicator size="large" color={colors.accent} />
            ) : (
              <LyricsViewer
                lyrics={lyrics}
                currentTimeSeconds={progress.position}
                showTranslation={showTranslation}
              />
            )
          ) : artworkUri ? (
            <Image
              source={{ uri: artworkUri }}
              style={styles.artworkImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.artworkFallback}>
              <Feather name="music" size={48} color={colors.textTertiary} />
            </View>
          )}
        </View>

        <Text style={[typography.title, styles.trackTitle]} numberOfLines={2}>
          {activeTrack?.title ?? 'Sin reproducción'}
        </Text>
        <Text style={styles.artist}>{activeTrack?.artist ?? ''}</Text>

        {/* --- BARRA DE ACCIÓN (LETRA / TRADUCCIÓN) --- */}
        <View style={styles.lyricsActionRow}>
          <TouchableOpacity
            style={[styles.lyricsButton, showLyrics && styles.activeLyricsButton]}
            onPress={handleToggleLyrics}
            activeOpacity={0.8}
          >
            <Feather
              name={showLyrics ? 'image' : 'mic'}
              size={13}
              color={colors.textPrimary}
              style={styles.lyricsButtonIcon}
            />
            <Text style={styles.lyricsButtonText}>{showLyrics ? 'Carátula' : 'Cargar letras'}</Text>
          </TouchableOpacity>

          {showLyrics && lyrics.length > 0 && (
            <TouchableOpacity
              style={[styles.lyricsButton, showTranslation && styles.activeLyricsButton]}
              onPress={() => setShowTranslation(!showTranslation)}
              activeOpacity={0.8}
            >
              <Feather name="globe" size={13} color={colors.textPrimary} style={styles.lyricsButtonIcon} />
              <Text style={styles.lyricsButtonText}>Traducir</Text>
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

          <TouchableOpacity onPress={toggleRepeatMode} hitSlop={styles.hitSlop} style={styles.secondaryControl}>
            <Feather name="repeat" size={18} color={repeatIsActive ? colors.accent : colors.textTertiary} />
            {repeatMode === RepeatMode.Track && <View style={styles.repeatOneDot} />}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => TrackPlayer.skipToPrevious()} hitSlop={styles.hitSlop}>
            <Feather name="skip-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>

          <TouchableOpacity onPress={togglePlayback} style={styles.playButton} activeOpacity={0.85}>
            <Feather name={isPlaying ? 'pause' : 'play'} size={40} color={colors.accent} />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => TrackPlayer.skipToNext()} hitSlop={styles.hitSlop}>
            <Feather name="skip-forward" size={24} color={colors.textPrimary} />
          </TouchableOpacity>

          <TouchableOpacity onPress={toggleShuffle} hitSlop={styles.hitSlop} style={styles.secondaryControl}>
            <Feather name="shuffle" size={18} color={isShuffle ? colors.accent : colors.textTertiary} />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
    paddingTop: 60,
    alignItems: 'center',
  },
  closeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: spacing.xl,
    gap: spacing.xs,
  },
  closeText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  artworkPlaceholder: {
    width: 260,
    height: 260,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
    overflow: 'hidden', // Asegura que las letras no sobresalgan del marco
  },
  artworkFallback: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  artworkImage: {
    width: '100%',
    height: '100%',
    borderRadius: radii.lg,
  },
  trackTitle: { textAlign: 'center' },
  artist: { color: colors.textSecondary, fontSize: 14, marginTop: spacing.xs },
  lyricsActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  lyricsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  activeLyricsButton: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.accent,
  },
  lyricsButtonIcon: { marginRight: spacing.xs, color: colors.accent },
  lyricsButtonText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  sliderTouchArea: {
    width: '100%',
    height: 40,
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  trackBackground: {
    width: '100%',
    height: 4,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.pill,
    justifyContent: 'center',
  },
  trackFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
  },
  thumb: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.accent,
    marginLeft: -8,
  },
  timeRow: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  timeText: { color: colors.textTertiary, fontSize: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xl, gap: spacing.xl },
  secondaryControl: { alignItems: 'center', justifyContent: 'center', marginHorizontal: spacing.xl},
  repeatOneDot: {
    position: 'absolute',
    top: -3,
    right: -6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.lg,
  },
  hitSlop: { top: 10, bottom: 10, left: 10, right: 10 },
});
