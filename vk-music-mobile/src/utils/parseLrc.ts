export interface LyricLine {
  time: number; // Tiempo en segundos (ej. 14.5)
  originalText: string;
  translatedText?: string;
}

export const parseLrcWithTranslation = (
  originalLrc?: string | null,
  translatedLrc?: string | null
): LyricLine[] => {
  if (!originalLrc) return [];

  const timeMap = new Map<string, LyricLine>();
  const regex = /^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;

  // 1. Procesar LRC original
  const origLines = originalLrc.split('\n');
  for (const line of origLines) {
    const match = line.trim().match(regex);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const milliseconds = parseInt(match[3].padEnd(3, '0'), 10);
      const timeInSeconds = minutes * 60 + seconds + milliseconds / 1000;
      const text = match[4].trim();

      if (text) {
        const timeKey = `${match[1]}:${match[2]}.${match[3]}`;
        timeMap.set(timeKey, {
          time: timeInSeconds,
          originalText: text,
        });
      }
    }
  }

  const items = Array.from(timeMap.values());

  // 2. Acoplar traducción respetando el orden
  if (translatedLrc) {
    const transLines = translatedLrc.split('\n');
    let idx = 0;
    for (const line of transLines) {
      const match = line.trim().match(regex);
      if (match) {
        const transText = match[4].trim();
        if (items[idx]) {
          items[idx].translatedText = transText;
          idx++;
        }
      }
    }
  }

  return items.sort((a, b) => a.time - b.time);
};