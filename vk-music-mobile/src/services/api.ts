import { SearchResult, AudioStreamData } from '../types';

const API_BASE_URL = 'https://prueba-g46s.onrender.com';

export const searchOnline = async (query: string): Promise<SearchResult[]> => {
  const url = `${API_BASE_URL}/search?q=${encodeURIComponent(query)}`;
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error('Error en la petición de búsqueda');
  }
  
  return await response.json();
};

export const getAudioStream = async (webpageUrl: string): Promise<AudioStreamData> => {
  const url = `${API_BASE_URL}/get-audio?url=${encodeURIComponent(webpageUrl)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Error al obtener el stream de audio');
  }

  return await response.json();
};