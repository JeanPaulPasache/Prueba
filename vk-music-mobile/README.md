# Migración a react-native-track-player

## 1. Instalar dependencias

```bash
npx expo install react-native-track-player @react-native-async-storage/async-storage @react-native-community/slider
npx expo install expo-dev-client
```

## 2. Copiar los archivos a tu proyecto

Reemplaza/crea:

- `App.tsx`
- `index.js`
- `src/services/api.ts` (igual al que ya tenías)
- `src/services/library.ts`
- `src/playback/playbackService.ts`
- `src/playback/setupPlayer.ts`
- `src/components/MiniPlayer.tsx`
- `src/screens/NowPlayingScreen.tsx`

## 3. Cambiar el entry point en `package.json`

Busca la línea `"main"` y déjala así:

```json
{
  "main": "index.js"
}
```

(antes probablemente decía `"node_modules/expo/AppEntry.js"` — ahora usamos
nuestro propio `index.js` porque necesitamos registrar el playback service
a nivel de módulo, antes de que se monte cualquier componente).

## 4. Configurar reproducción en segundo plano (`app.json`)

Agrega esto dentro de `"expo"`:

```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "UIBackgroundModes": ["audio"]
      }
    },
    "android": {
      "permissions": [
        "FOREGROUND_SERVICE",
        "FOREGROUND_SERVICE_MEDIA_PLAYBACK",
        "WAKE_LOCK"
      ]
    }
  }
}
```

## 5. Generar el build de desarrollo (solo una vez)

```bash
npx expo prebuild
```

Luego, para correrlo local (necesitas Android Studio / Xcode):

```bash
npx expo run:android
# o
npx expo run:ios
```

O si prefieres que Expo compile en la nube (no necesitas nada instalado
localmente, solo esperar el build y descargar el `.apk`):

```bash
eas build --profile development --platform android
```

## 6. Desarrollo normal después del build

Una vez instalado el build de desarrollo en tu celular/emulador, vuelves a
tu flujo de siempre:

```bash
npx expo start
```

Abres la app instalada (no Expo Go) y tienes Fast Refresh normal. Solo
repites el paso 5 si agregas otra librería nativa o cambias `app.json`.

## Qué cambió respecto a tu versión con expo-av

- **`api.ts`**: igual, no se tocó (tu backend en Render sigue funcionando exactamente igual).
- **`library.ts`** (nuevo): antes solo guardabas la última canción descargada en memoria (`currentTrack`). Ahora se persiste una lista completa en `AsyncStorage`, así que tu "biblioteca" sobrevive a que cierres la app.
- **Reproducción**: en vez de `Audio.Sound.createAsync`, cada descarga se agrega a la cola de `TrackPlayer`, lo que te da automáticamente controles en notificación/lock screen y reproducción en segundo plano.
- **UI**: se agregó un `MiniPlayer` (barra inferior) y una pantalla `NowPlayingScreen` (modal a pantalla completa con seek bar). El botón "Exportar MP3" (`Share`) lo quité de este ejemplo para no alargarlo demasiado — si lo quieres de vuelta, es el mismo código de tu versión original, solo agrégalo donde prefieras (por ejemplo, dentro de `NowPlayingScreen`).
