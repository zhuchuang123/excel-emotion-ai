export type SentimentLabel = "正面" | "负面" | "中立";

export type AnalyzeItem = {
  id: string | number;
  text: string;
};

export type SentimentResult = {
  id: string | number;
  score: number;
  sentiment: SentimentLabel;
  confidence: number;
};

export type ParsedSheet = {
  fileName: string;
  sheetName: string;
  columns: string[];
  totalRows: number;
  items: AnalyzeItem[];
  warnings: string[];
};
