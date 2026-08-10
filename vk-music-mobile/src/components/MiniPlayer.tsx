import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import TrackPlayer, {
  usePlaybackState,
  useActiveTrack,
  useProgress,
  State,
} from 'react-native-track-player';

interface Props {
  onPress: () => void;
}

export default function MiniPlayer({ onPress }: Props) {
  const playbackState = usePlaybackState();
  const activeTrack = useActiveTrack();
  const { position, duration } = useProgress();

  if (!activeTrack) return null;

  const isPlaying = playbackState.state === State.Playing;

  const togglePlayback = async () => {
    try {
      if (isPlaying) {
        await TrackPlayer.pause();
      } else {
        await TrackPlayer.play();
      }
    } catch (error) {
      console.log('Error en el control de reproducción:', error);
    }
  };

  const handleSkipNext = async () => {
    try {
      await TrackPlayer.skipToNext();
    } catch {
      // Ocurre cuando se alcanza el final de la lista de reproducción
      console.log('Fin de la cola de reproducción');
    }
  };

  // Porcentaje de reproducción para la minibarra superior
  const progressPercent = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.85}>
      {/* Mini barra de progreso superior */}
      <View style={styles.progressBarBackground}>
        <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
      </View>

      <View style={styles.content}>
        <View style={styles.infoContainer}>
          <Text style={styles.title} numberOfLines={1}>
            {activeTrack.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {activeTrack.artist || 'Artista Desconocido'}
          </Text>
        </View>

        <TouchableOpacity style={styles.button} onPress={togglePlayback}>
          <Text style={styles.buttonIcon}>{isPlaying ? '⏸' : '▶️'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={handleSkipNext}>
          <Text style={styles.buttonIcon}>⏭</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1e1e1e',
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  progressBarBackground: {
    height: 3,
    backgroundColor: '#333',
    width: '100%',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#0088cc',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  infoContainer: { flex: 1, marginRight: 10 },
  title: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  artist: { color: '#aaa', fontSize: 12, marginTop: 2 },
  button: { paddingHorizontal: 10 },
  buttonIcon: { fontSize: 22, color: '#fff' },
});