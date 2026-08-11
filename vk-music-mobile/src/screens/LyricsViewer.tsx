import React, { useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { LyricLine } from '../utils/parseLrc';

interface Props {
  lyrics: LyricLine[];
  currentTimeSeconds: number; // Proviene de expo-av / react-native-track-player
  showTranslation?: boolean;
}

export const LyricsViewer = ({ lyrics, currentTimeSeconds, showTranslation = false }: Props) => {
  const flatListRef = useRef<FlatList>(null);
  const [activeIndex, setActiveIndex] = useState<number>(0);

  useEffect(() => {
    if (!lyrics.length) return;

    // Detectar en qué línea se encuentra la reproducción actual
    const index = lyrics.findIndex((line, i) => {
      const nextLine = lyrics[i + 1];
      return (
        currentTimeSeconds >= line.time &&
        (!nextLine || currentTimeSeconds < nextLine.time)
      );
    });

    if (index !== -1 && index !== activeIndex) {
      setActiveIndex(index);
      flatListRef.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.5, // Centra la línea activa en la pantalla
      });
    }
  }, [currentTimeSeconds, lyrics]);

  if (!lyrics.length) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>Sin letras disponibles para esta canción.</Text>
      </View>
    );
  }

  return (
    <FlatList
      ref={flatListRef}
      data={lyrics}
      keyExtractor={(_, index) => index.toString()}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
      onScrollToIndexFailed={(info) => {
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({ index: info.index, animated: true });
        }, 100);
      }}
      renderItem={({ item, index }) => {
        const isActive = index === activeIndex;
        return (
          <View style={styles.lineWrapper}>
            <Text style={[styles.origText, isActive ? styles.activeOrig : styles.inactiveOrig]}>
              {item.originalText}
            </Text>
            {showTranslation && item.translatedText && (
              <Text style={[styles.transText, isActive ? styles.activeTrans : styles.inactiveTrans]}>
                {item.translatedText}
              </Text>
            )}
          </View>
        );
      }}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 140,
    paddingHorizontal: 20,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#888888',
    fontSize: 16,
  },
  lineWrapper: {
    marginVertical: 14,
    alignItems: 'center',
  },
  origText: {
    textAlign: 'center',
    fontWeight: '700',
  },
  activeOrig: {
    color: '#FFFFFF',
    fontSize: 22,
    opacity: 1,
  },
  inactiveOrig: {
    color: '#888888',
    fontSize: 18,
    opacity: 0.35,
  },
  transText: {
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic',
  },
  activeTrans: {
    color: '#1DB954',
    fontSize: 16,
    opacity: 0.9,
  },
  inactiveTrans: {
    color: '#666666',
    fontSize: 14,
    opacity: 0.3,
  },
});