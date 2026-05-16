"use client";

import * as XLSX from "xlsx";
import type { AnalyzeItem, ParsedSheet } from "@/lib/types";

const SUPPORTED_EXTENSIONS = [".xlsx", ".xls", ".csv"];
const ID_COLUMN_CANDIDATES = [
  "序号",
  "编号",
  "id",
  "ID",
  "Id",
  "No",
  "no",
  "序列号"
];
const TEXT_COLUMN_CANDIDATES = [
  "评论文本",
  "评论",
  "文本",
  "内容",
  "评价",
  "留言",
  "comment",
  "comments",
  "text",
  "review"
];

export const MAX_CLIENT_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_CLIENT_FILE_SIZE_MB = 5;
export const MAX_CLIENT_ROWS = 500;

type ExportableAnalysisRow = {
  id: string | number;
  text: string;
  score: number;
  sentiment: string;
  confidence: number;
  status?: "success" | "failed";
  error?: string;
};

function normalizeHeader(value: string) {
  return value.replace(/\s+/g, "").trim().toLowerCase();
}

function getFileExtension(fileName: string) {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : "";
}

function findColumn(headers: string[], candidates: string[]) {
  const normalizedCandidates = candidates.map(normalizeHeader);
  const exactMatch = headers.find((header) =>
    normalizedCandidates.includes(normalizeHeader(header))
  );

  if (exactMatch) return exactMatch;

  return headers.find((header) => {
    const normalized = normalizeHeader(header);
    return normalizedCandidates.some(
      (candidate) =>
        normalized.includes(candidate) || candidate.includes(normalized)
    );
  });
}

function readWorkbook(file: File, extension: string): Promise<XLSX.WorkBook> {
  if (extension === ".csv") {
    return file.text().then((content) =>
      XLSX.read(content, {
        type: "string"
      })
    );
  }

  return file.arrayBuffer().then((buffer) =>
    XLSX.read(buffer, {
      type: "array"
    })
  );
}

function stringifyCell(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function rowToItem(
  row: Record<string, unknown>,
  rowIndex: number,
  idColumn: string | undefined,
  textColumn: string
): AnalyzeItem | null {
  const text = stringifyCell(row[textColumn]);

  if (!text) return null;

  const id = idColumn ? stringifyCell(row[idColumn]) : "";

  return {
    id: id || rowIndex + 1,
    text
  };
}

export async function parseSpreadsheetFile(file: File): Promise<ParsedSheet> {
  const extension = getFileExtension(file.name);

  if (!SUPPORTED_EXTENSIONS.includes(extension)) {
    throw new Error("仅支持 .xlsx、.xls、.csv 文件");
  }

  if (file.size > MAX_CLIENT_FILE_SIZE_BYTES) {
    throw new Error(`文件不能超过 ${MAX_CLIENT_FILE_SIZE_MB}MB`);
  }

  const workbook = await readWorkbook(file, extension);
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error("表格中没有可读取的工作表");
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false
  });

  if (rows.length === 0) {
    throw new Error("表格内容为空");
  }

  const columns = Object.keys(rows[0] ?? {});
  const idColumn = findColumn(columns, ID_COLUMN_CANDIDATES) ?? columns[0];
  const textColumn =
    findColumn(columns, TEXT_COLUMN_CANDIDATES) ??
    columns.find((column) => column !== idColumn) ??
    columns[1];

  if (!textColumn) {
    throw new Error("未找到评论文本列");
  }

  const warnings: string[] = [];
  const parsedItems = rows
    .map((row, index) => rowToItem(row, index, idColumn, textColumn))
    .filter((item): item is AnalyzeItem => Boolean(item));

  if (parsedItems.length === 0) {
    throw new Error("评论文本列没有可分析内容");
  }

  if (rows.length > MAX_CLIENT_ROWS) {
    warnings.push(`已读取前 ${MAX_CLIENT_ROWS} 条，剩余数据暂未纳入本次分析`);
  }

  if (!findColumn(columns, TEXT_COLUMN_CANDIDATES)) {
    warnings.push(`未识别到标准评论列名，已使用「${textColumn}」作为评论文本`);
  }

  return {
    fileName: file.name,
    sheetName,
    columns,
    totalRows: rows.length,
    items: parsedItems.slice(0, MAX_CLIENT_ROWS),
    warnings
  };
}

function formatDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function buildExportFileName() {
  const now = new Date();
  const date = [
    now.getFullYear(),
    formatDatePart(now.getMonth() + 1),
    formatDatePart(now.getDate())
  ].join("");
  const time = [
    formatDatePart(now.getHours()),
    formatDatePart(now.getMinutes()),
    formatDatePart(now.getSeconds())
  ].join("");

  return `情感分析结果_${date}_${time}.xlsx`;
}

export function downloadAnalysisWorkbook(rows: ExportableAnalysisRow[]) {
  if (rows.length === 0) {
    throw new Error("没有可导出的分析结果");
  }

  const data = rows.map((row) => ({
    序号: row.id,
    评论文本: row.text,
    分数: row.score,
    情感倾向: row.sentiment,
    置信度: Number(row.confidence.toFixed(2)),
    状态: row.status === "failed" ? "失败" : "成功",
    错误信息: row.error ?? ""
  }));

  const worksheet = XLSX.utils.json_to_sheet(data, {
    header: ["序号", "评论文本", "分数", "情感倾向", "置信度", "状态", "错误信息"]
  });

  worksheet["!cols"] = [
    { wch: 10 },
    { wch: 56 },
    { wch: 8 },
    { wch: 12 },
    { wch: 10 },
    { wch: 8 },
    { wch: 32 }
  ];
  worksheet["!autofilter"] = {
    ref: `A1:G${rows.length + 1}`
  };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "情感分析结果");
  XLSX.writeFile(workbook, buildExportFileName(), {
    compression: true
  });
}
