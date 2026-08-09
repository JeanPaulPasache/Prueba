import axios from 'axios';
import { SearchResult, AudioStreamData } from '../types';

const API_BASE_URL = 'https://tu-api.onrender.com';

export const searchOnline = async (query: string): Promise<SearchResult[]> => {
  const response = await axios.get<SearchResult[]>(`${API_BASE_URL}/search`, {
    params: { q: query },
  });
  return response.data;
};

export const getAudioStream = async (webpageUrl: string): Promise<AudioStreamData> => {
  const response = await axios.get<AudioStreamData>(`${API_BASE_URL}/get-audio`, {
    params: { url: webpageUrl },
  });
  return response.data;
};