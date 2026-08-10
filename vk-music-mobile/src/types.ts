export interface Track {
  id: string;
  query: string;
  fileName: string;
  blobUrl: string;
  downloadedAt: Date;
}

export interface ApiError {
  detail: string;
}