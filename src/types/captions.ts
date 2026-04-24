export type WordTimestamp = {
  word: string;
  start: number;
  end: number;
};

export type CaptionChunk = {
  text: string;
  start: number;
  end: number;
  words: WordTimestamp[];
};

export type CaptionData = {
  chunks: CaptionChunk[];
};
