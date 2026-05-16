"use client";

import {
  Download,
  FileSpreadsheet,
  Play,
  RotateCcw,
  Search,
  TestTube2,
  UploadCloud
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  MAX_CLIENT_FILE_SIZE_MB,
  MAX_CLIENT_ROWS,
  downloadAnalysisWorkbook,
  parseSpreadsheetFile
} from "@/lib/excel";
import type { AnalyzeItem, ParsedSheet, SentimentResult } from "@/lib/types";

const CLIENT_BATCH_SIZE = 10;

type ApiResponse =
  | {
      ok: true;
      provider: string;
      results: SentimentResult[];
    }
  | {
      ok: false;
      error: string;
    };

type AnalysisRow = SentimentResult & {
  text: string;
  status: "success" | "failed";
  error?: string;
};

type SentimentFilter = "全部" | "正面" | "中立" | "负面";
type StatusFilter = "全部" | "成功" | "失败";

type AnalysisProgress = {
  total: number;
  completed: number;
  success: number;
  failed: number;
  currentBatch: number;
  totalBatches: number;
};

type AnalysisSummary = {
  total: number;
  success: number;
  failed: number;
  positive: number;
  neutral: number;
  negative: number;
  averageScore: string;
  successRate: number;
  positiveRate: number;
  neutralRate: number;
  negativeRate: number;
};

const emptyProgress: AnalysisProgress = {
  total: 0,
  completed: 0,
  success: 0,
  failed: 0,
  currentBatch: 0,
  totalBatches: 0
};

function badgeClass(sentiment: string) {
  if (sentiment === "正面") return "badge badge-positive";
  if (sentiment === "负面") return "badge badge-negative";
  return "badge badge-neutral";
}

function statusClass(status: AnalysisRow["status"]) {
  return status === "success" ? "status status-success" : "status status-failed";
}

function chunkItems<T>(items: T[], size: number) {
  const batches: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }

  return batches;
}

function countRows(rows: AnalysisRow[]) {
  return rows.reduce(
    (summary, row) => {
      if (row.status === "success") {
        summary.success += 1;
      } else {
        summary.failed += 1;
      }

      return summary;
    },
    {
      success: 0,
      failed: 0
    }
  );
}

function percent(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function buildAnalysisSummary(rows: AnalysisRow[]): AnalysisSummary {
  const successRows = rows.filter((row) => row.status === "success");
  const positive = successRows.filter((row) => row.sentiment === "正面").length;
  const neutral = successRows.filter((row) => row.sentiment === "中立").length;
  const negative = successRows.filter((row) => row.sentiment === "负面").length;
  const failed = rows.length - successRows.length;
  const scoreTotal = successRows.reduce((total, row) => total + row.score, 0);

  return {
    total: rows.length,
    success: successRows.length,
    failed,
    positive,
    neutral,
    negative,
    averageScore: successRows.length
      ? (scoreTotal / successRows.length).toFixed(1)
      : "-",
    successRate: percent(successRows.length, rows.length),
    positiveRate: percent(positive, successRows.length),
    neutralRate: percent(neutral, successRows.length),
    negativeRate: percent(negative, successRows.length)
  };
}

function matchesSearch(row: AnalysisRow, keyword: string) {
  const normalizedKeyword = keyword.trim().toLowerCase();

  if (!normalizedKeyword) return true;

  return [row.id, row.text, row.sentiment, row.score, row.error]
    .map((value) => String(value ?? "").toLowerCase())
    .some((value) => value.includes(normalizedKeyword));
}

function mergeBatchResults(
  items: AnalyzeItem[],
  results: SentimentResult[]
): AnalysisRow[] {
  const resultMap = new Map(
    results.map((result) => [String(result.id), result])
  );

  return items.map((item) => {
    const result = resultMap.get(String(item.id));

    if (!result) {
      return {
        id: item.id,
        text: item.text,
        score: 5,
        sentiment: "中立" as const,
        confidence: 0,
        status: "failed" as const,
        error: "接口未返回该条结果"
      };
    }

    return {
      ...result,
      text: item.text,
      status: "success" as const
    };
  });
}

function failedBatchRows(items: AnalyzeItem[], error: string): AnalysisRow[] {
  return items.map((item) => ({
    id: item.id,
    text: item.text,
    score: 5,
    sentiment: "中立" as const,
    confidence: 0,
    status: "failed" as const,
    error
  }));
}

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [accessCode, setAccessCode] = useState("");
  const [parsedSheet, setParsedSheet] = useState<ParsedSheet | null>(null);
  const [provider, setProvider] = useState<string>("待检测");
  const [analysisRows, setAnalysisRows] = useState<AnalysisRow[]>([]);
  const [progress, setProgress] = useState<AnalysisProgress>(emptyProgress);
  const [message, setMessage] = useState<string>("");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [sentimentFilter, setSentimentFilter] =
    useState<SentimentFilter>("全部");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("全部");
  const [parsing, setParsing] = useState(false);
  const [loading, setLoading] = useState(false);

  const previewRows = useMemo(
    () => parsedSheet?.items.slice(0, 10) ?? [],
    [parsedSheet]
  );
  const analysisSummary = useMemo(
    () => buildAnalysisSummary(analysisRows),
    [analysisRows]
  );
  const filteredRows = useMemo(
    () =>
      analysisRows.filter((row) => {
        const sentimentMatches =
          sentimentFilter === "全部" || row.sentiment === sentimentFilter;
        const statusMatches =
          statusFilter === "全部" ||
          (statusFilter === "成功" && row.status === "success") ||
          (statusFilter === "失败" && row.status === "failed");

        return (
          sentimentMatches &&
          statusMatches &&
          matchesSearch(row, searchKeyword)
        );
      }),
    [analysisRows, searchKeyword, sentimentFilter, statusFilter]
  );
  const progressPercent = progress.total
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;

  async function handleFile(file: File | undefined) {
    if (!file) return;

    setParsing(true);
    setMessage("");
    setAnalysisRows([]);
    setProgress(emptyProgress);
    setProvider("待检测");
    setSearchKeyword("");
    setSentimentFilter("全部");
    setStatusFilter("全部");

    try {
      const sheet = await parseSpreadsheetFile(file);
      setParsedSheet(sheet);
    } catch (error) {
      setParsedSheet(null);
      setMessage(error instanceof Error ? error.message : "文件解析失败");
    } finally {
      setParsing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function requestBatch(items: AnalyzeItem[]) {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        accessCode,
        items
      })
    });

    const data = (await response.json()) as ApiResponse;

    if (!response.ok || !data.ok) {
      throw new Error(data.ok ? "接口响应异常" : data.error);
    }

    setProvider(data.provider);
    return data.results;
  }

  async function runAnalysis(targetItems: AnalyzeItem[]) {
    if (!targetItems.length) {
      setMessage("请先上传表格");
      return;
    }

    const batches = chunkItems(targetItems, CLIENT_BATCH_SIZE);
    const nextRows: AnalysisRow[] = [];

    setLoading(true);
    setMessage("");
    setAnalysisRows([]);
    setProgress({
      ...emptyProgress,
      total: targetItems.length,
      totalBatches: batches.length
    });

    try {
      for (let index = 0; index < batches.length; index += 1) {
        const batch = batches[index];
        const currentBatch = index + 1;

        setProgress((current) => ({
          ...current,
          currentBatch
        }));

        try {
          const batchResults = await requestBatch(batch);
          nextRows.push(...mergeBatchResults(batch, batchResults));
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "本批次分析失败";
          nextRows.push(...failedBatchRows(batch, errorMessage));
        }

        const counts = countRows(nextRows);
        setAnalysisRows([...nextRows]);
        setProgress({
          total: targetItems.length,
          completed: nextRows.length,
          success: counts.success,
          failed: counts.failed,
          currentBatch,
          totalBatches: batches.length
        });
      }

      const finalCounts = countRows(nextRows);
      setMessage(
        finalCounts.failed > 0
          ? `批量分析完成，${finalCounts.failed} 条失败`
          : "批量分析完成"
      );
    } finally {
      setLoading(false);
    }
  }

  function exportResults() {
    try {
      downloadAnalysisWorkbook(analysisRows);
      setMessage("结果文件已生成");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导出失败");
    }
  }

  function resetPage() {
    setParsedSheet(null);
    setAnalysisRows([]);
    setProgress(emptyProgress);
    setMessage("");
    setProvider("待检测");
    setSearchKeyword("");
    setSentimentFilter("全部");
    setStatusFilter("全部");
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">AI</div>
          <h1>Excel 情感分析平台</h1>
        </div>
        <div className="status-pill">当前引擎：{provider}</div>
      </header>

      <section className="workspace">
        <aside className="panel">
          <h2>数据导入</h2>

          <div className="field">
            <label htmlFor="access-code">访问码</label>
            <input
              className="input"
              id="access-code"
              onChange={(event) => setAccessCode(event.target.value)}
              placeholder="请输入访问码"
              type="password"
              value={accessCode}
            />
          </div>

          <input
            accept=".xlsx,.xls,.csv"
            className="visually-hidden"
            id="file-upload"
            onChange={(event) => handleFile(event.target.files?.[0])}
            ref={fileInputRef}
            type="file"
          />

          <button
            className="upload-zone"
            disabled={parsing || loading}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <UploadCloud aria-hidden="true" size={28} />
            <span>{parsing ? "解析中" : "选择表格文件"}</span>
            <small>.xlsx / .xls / .csv，最大 {MAX_CLIENT_FILE_SIZE_MB}MB</small>
          </button>

          {parsedSheet ? (
            <div className="file-card">
              <div className="file-icon">
                <FileSpreadsheet aria-hidden="true" size={20} />
              </div>
              <div>
                <strong>{parsedSheet.fileName}</strong>
                <span>
                  {parsedSheet.sheetName}，{parsedSheet.items.length} 条可分析
                </span>
              </div>
            </div>
          ) : null}

          <div className="button-row">
            <button
              className="button button-primary"
              disabled={!parsedSheet || loading || parsing}
              onClick={() => runAnalysis(parsedSheet?.items ?? [])}
              type="button"
            >
              <Play aria-hidden="true" size={16} />
              {loading ? "分析中" : "分析全部"}
            </button>
            <button
              className="button button-secondary"
              disabled={!parsedSheet || loading || parsing}
              onClick={() => runAnalysis(parsedSheet?.items.slice(0, 1) ?? [])}
              type="button"
            >
              <TestTube2 aria-hidden="true" size={16} />
              首条测试
            </button>
            <button
              className="button button-secondary"
              disabled={!analysisRows.length || loading || parsing}
              onClick={exportResults}
              type="button"
            >
              <Download aria-hidden="true" size={16} />
              导出结果
            </button>
            <button
              className="button button-secondary icon-button"
              disabled={loading || parsing}
              onClick={resetPage}
              title="重置"
              type="button"
            >
              <RotateCcw aria-hidden="true" size={16} />
            </button>
          </div>

          {progress.total > 0 ? (
            <div className="progress-card">
              <div className="progress-topline">
                <strong>{progressPercent}%</strong>
                <span>
                  {progress.currentBatch}/{progress.totalBatches} 批
                </span>
              </div>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="metric-grid">
                <div>
                  <strong>{progress.completed}</strong>
                  <span>已处理</span>
                </div>
                <div>
                  <strong>{progress.success}</strong>
                  <span>成功</span>
                </div>
                <div>
                  <strong>{progress.failed}</strong>
                  <span>失败</span>
                </div>
              </div>
            </div>
          ) : null}

          {message ? <div className="notice">{message}</div> : null}

          {parsedSheet?.warnings.map((warning) => (
            <div className="notice" key={warning}>
              {warning}
            </div>
          ))}
        </aside>

        <section className="panel">
          <div className="result-header">
            <h2>{analysisRows.length > 0 ? "分析结果" : "数据预览"}</h2>
            <div className="result-meta">
              {parsedSheet
                ? `${parsedSheet.totalRows} 行，最多读取 ${MAX_CLIENT_ROWS} 条`
                : "等待上传"}
            </div>
          </div>

          {analysisRows.length > 0 ? (
            <>
              <div className="summary-band">
                <div className="summary-metrics">
                  <div>
                    <span>平均分</span>
                    <strong>{analysisSummary.averageScore}</strong>
                  </div>
                  <div>
                    <span>成功率</span>
                    <strong>{analysisSummary.successRate}%</strong>
                  </div>
                  <div>
                    <span>正面</span>
                    <strong>{analysisSummary.positive}</strong>
                  </div>
                  <div>
                    <span>中立</span>
                    <strong>{analysisSummary.neutral}</strong>
                  </div>
                  <div>
                    <span>负面</span>
                    <strong>{analysisSummary.negative}</strong>
                  </div>
                </div>
                <div className="sentiment-stack" aria-hidden="true">
                  <div
                    className="sentiment-segment segment-positive"
                    style={{ width: `${analysisSummary.positiveRate}%` }}
                  />
                  <div
                    className="sentiment-segment segment-neutral"
                    style={{ width: `${analysisSummary.neutralRate}%` }}
                  />
                  <div
                    className="sentiment-segment segment-negative"
                    style={{ width: `${analysisSummary.negativeRate}%` }}
                  />
                </div>
                <div className="summary-footnote">
                  已成功分析 {analysisSummary.success}/{analysisSummary.total} 条
                  {analysisSummary.failed > 0
                    ? `，失败 ${analysisSummary.failed} 条`
                    : ""}
                </div>
              </div>

              <div className="filter-bar">
                <div className="search-field">
                  <Search aria-hidden="true" size={16} />
                  <input
                    aria-label="搜索结果"
                    onChange={(event) => setSearchKeyword(event.target.value)}
                    placeholder="搜索序号、评论或错误信息"
                    value={searchKeyword}
                  />
                </div>
                <select
                  aria-label="情感筛选"
                  className="select"
                  onChange={(event) =>
                    setSentimentFilter(event.target.value as SentimentFilter)
                  }
                  value={sentimentFilter}
                >
                  <option value="全部">全部情感</option>
                  <option value="正面">正面</option>
                  <option value="中立">中立</option>
                  <option value="负面">负面</option>
                </select>
                <select
                  aria-label="状态筛选"
                  className="select"
                  onChange={(event) =>
                    setStatusFilter(event.target.value as StatusFilter)
                  }
                  value={statusFilter}
                >
                  <option value="全部">全部状态</option>
                  <option value="成功">成功</option>
                  <option value="失败">失败</option>
                </select>
                <span className="filter-count">
                  显示 {filteredRows.length}/{analysisRows.length}
                </span>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>序号</th>
                      <th>评论文本</th>
                      <th>分数</th>
                      <th>情感倾向</th>
                      <th>置信度</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((result, index) => (
                      <tr key={`${String(result.id)}-${index}`}>
                        <td>{result.id}</td>
                        <td>
                          {result.text}
                          {result.error ? (
                            <div className="cell-note">{result.error}</div>
                          ) : null}
                        </td>
                        <td>{result.score}</td>
                        <td>
                          <span className={badgeClass(result.sentiment)}>
                            {result.sentiment}
                          </span>
                        </td>
                        <td>{Math.round(result.confidence * 100)}%</td>
                        <td>
                          <span className={statusClass(result.status)}>
                            {result.status === "success" ? "成功" : "失败"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : previewRows.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>序号</th>
                    <th>评论文本</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((item) => (
                    <tr key={String(item.id)}>
                      <td>{item.id}</td>
                      <td>{item.text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">等待表格数据</div>
          )}
        </section>
      </section>
    </main>
  );
}
