import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, Alert } from 'react-native';
// @ts-ignore: react-native-track-player may not expose type declarations in this repo
import TrackPlayer, { useActiveTrack } from 'react-native-track-player';
import { Feather } from '@expo/vector-icons';
import { LocalTrack } from './src/services/api';
import { getLibrary, deleteTrack } from './src/services/library';
import { setupPlayer, trackFromLocalTrack } from './src/playback/setupPlayer';
import MiniPlayer from './src/components/MiniPlayer';
import NowPlayingScreen from './src/screens/NowPlayingScreen';
import LibraryScreen from './src/screens/LibraryScreen';
import SearchScreen from './src/screens/SearchScreen';
import { colors, spacing, typography } from './src/utils/theme';

type Screen = 'library' | 'search';

export default function App() {
  const [screen, setScreen] = useState<Screen>('library');
  const [library, setLibrary] = useState<LocalTrack[]>([]);
  const [nowPlayingVisible, setNowPlayingVisible] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerError, setPlayerError] = useState(false);

  const activeTrack = useActiveTrack();

  // Inicializar TrackPlayer y cargar la biblioteca guardada al abrir la app.
  // La biblioteca es lo primero que ve el usuario, como en una app real.
  useEffect(() => {
    (async () => {
      const ok = await setupPlayer();
      setPlayerReady(ok);
      setPlayerError(!ok);
      const savedLibrary = await getLibrary();
      setLibrary(savedLibrary);
    })();
  }, []);

  // Carga una cola completa en TrackPlayer y arranca en el track elegido
  const playTrack = useCallback(
    async (track: LocalTrack, queue: LocalTrack[]) => {
      if (!playerReady) {
        Alert.alert('Reproductor no listo', 'Espera un momento e intenta de nuevo.');
        return;
      }
      await TrackPlayer.reset();
      await TrackPlayer.add(queue.map(trackFromLocalTrack));
      const index = queue.findIndex((t) => t.id === track.id);
      if (index > 0) await TrackPlayer.skip(index);
      await TrackPlayer.play();
    },
    [playerReady]
  );

  const handleDeleteTrack = useCallback(
    (track: LocalTrack) => {
      deleteTrack(track, library, setLibrary);
    },
    [library]
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logoBadge}>
            <Feather name="music" size={16} color={colors.textPrimary} />
          </View>
          <Text style={typography.title}>Mi Music</Text>
        </View>
      </View>

      {playerError && (
        <View style={styles.errorBanner}>
          <Feather name="alert-circle" size={14} color={colors.accent} style={{ marginRight: spacing.sm }} />
          <Text style={styles.errorBannerText}>No se pudo iniciar el reproductor. Reiniciá la app.</Text>
        </View>
      )}

      {screen === 'library' ? (
        <LibraryScreen
          library={library}
          activeTrackId={activeTrack?.id}
          onPlayTrack={(track) => playTrack(track, library)}
          onDeleteTrack={handleDeleteTrack}
          onGoToSearch={() => setScreen('search')}
        />
      ) : (
        <SearchScreen
          library={library}
          onLibraryUpdate={setLibrary}
          onPlayTrack={playTrack}
          onGoBack={() => setScreen('library')}
        />
      )}

      <MiniPlayer onPress={() => setNowPlayingVisible(true)} />
      <NowPlayingScreen visible={nowPlayingVisible} onClose={() => setNowPlayingVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    paddingTop: 60,
    paddingBottom: 80,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logoBadge: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentMuted,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorBannerText: { color: colors.textPrimary, fontSize: 13, flex: 1 },
});
