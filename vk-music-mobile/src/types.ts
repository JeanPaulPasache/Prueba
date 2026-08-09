export interface SearchResult {
  id: string;
  title: string;
  uploader?: string;
  duration?: number;
  webpage_url: string;
}

export interface AudioStreamData {
  title: string;
  uploader?: string;
  duration?: number;
  audio_url: string;
}