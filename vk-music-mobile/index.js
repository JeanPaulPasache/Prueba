import { registerRootComponent } from 'expo';
import TrackPlayer from 'react-native-track-player';
import App from './App';
import { PlaybackService } from './src/playback/playbackService';

registerRootComponent(App);

// Debe registrarse fuera de cualquier componente, a nivel de módulo
TrackPlayer.registerPlaybackService(() => PlaybackService);
