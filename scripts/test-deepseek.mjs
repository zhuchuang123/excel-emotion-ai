import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEFAULT_MODEL = "deepseek-v4-flash";

function loadEnvFile(fileName) {
  const filePath = resolve(process.cwd(), fileName);

  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) continue;

    const key = match[1].trim();
    const value = match[2].trim().replace(/^['"]|['"]$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function buildPrompt() {
  const items = [
    {
      id: 1,
      text: "这个康养旅游项目环境不错，服务也很好，感觉适合带父母体验。"
    },
    {
      id: 2,
      text: "价格偏贵，流程也有点混乱，整体体验不太满意。"
    }
  ];

  return [
    "你是一个中文评论情感分析模型。",
    "请分析每条评论的情感倾向，并返回严格 JSON。",
    "评分规则：0-4 为负面，5 为中立客观，6-10 为正面积极。",
    "置信度 confidence 必须是 0 到 1 的小数。",
    "必须返回 JSON，不要输出 Markdown，不要解释，不要省略任何评论。",
    "JSON 格式：{\"results\":[{\"id\":\"原序号\",\"score\":8,\"sentiment\":\"正面\",\"confidence\":0.92}]}",
    `评论列表：${JSON.stringify(items)}`
  ].join("\n");
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const apiKey = process.env.DEEPSEEK_API_KEY;
const model = process.env.DEEPSEEK_MODEL || DEFAULT_MODEL;

if (!apiKey) {
  console.error("缺少 DEEPSEEK_API_KEY。请先复制 .env.example 为 .env.local 并填写 Key。");
  process.exit(1);
}

const response = await fetch(DEEPSEEK_API_URL, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model,
    messages: [
      {
        role: "system",
        content:
          "你负责把中文评论映射为结构化情感分析结果，必须遵守用户给定的评分规则，且只输出 JSON。"
      },
      {
        role: "user",
        content: buildPrompt()
      }
    ],
    response_format: {
      type: "json_object"
    },
    temperature: 0,
    max_tokens: 800,
    thinking: {
      type: "disabled"
    }
  })
});

const text = await response.text();

if (!response.ok) {
  console.error(`DeepSeek 调用失败：${response.status}`);
  console.error(text);
  process.exit(1);
}

const data = JSON.parse(text);
const content = data.choices?.[0]?.message?.content;

console.log(content ?? text);
