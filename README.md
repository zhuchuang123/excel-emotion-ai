# Excel Emotion AI

面向评论表格的情感分析平台。当前版本已经包含表格上传解析、批量情感分析、结果预览、Excel 导出、访问码校验和 DeepSeek API 调用入口。

## 本地运行

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`。

如果需要用本机外部浏览器或同一局域网内的其他电脑访问，可以运行：

```bash
npm run dev:lan
```

然后在本机浏览器打开 `http://127.0.0.1:3000`，或在同一局域网设备上打开 `http://你的本机IP:3000`。

公网外部访问需要部署到 Vercel / Cloudflare 这类平台，而不是使用本机 IP。部署后会得到类似 `https://excel-emotion-ai.vercel.app` 的公网网址。

提交或部署前可以运行：

```bash
npm run verify
```

## 环境变量

复制 `.env.example` 为 `.env`，按需填写：

```bash
DEEPSEEK_API_KEY=你的 DeepSeek API Key
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_TIMEOUT_MS=30000
ACCESS_CODE=demo2026
ALLOWED_ORIGINS=
MAX_ITEMS_PER_REQUEST=20
MAX_TEXT_LENGTH=500
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=30
```

没有配置 `DEEPSEEK_API_KEY` 时，系统会使用内置 mock 逻辑，方便先验证页面和接口链路。

如果部署时不会配置环境变量，也可以不填 `DEEPSEEK_API_KEY`。网页里有 `DeepSeek API Key` 输入框，分析时临时填写即可；Key 不会提交到 Git 仓库，也不会保存在服务器。

## 防滥用配置

- `ACCESS_CODE`：页面调用接口时必须提交的访问码。
- `ALLOWED_ORIGINS`：允许调用 API 的前端来源，多个地址用英文逗号分隔；前后端同域部署时可以留空。
- `MAX_ITEMS_PER_REQUEST`：单次接口最多分析的评论条数。
- `MAX_TEXT_LENGTH`：单条评论最大字符数。
- `RATE_LIMIT_WINDOW_MS`：频率限制窗口，默认 60000 毫秒。
- `RATE_LIMIT_MAX_REQUESTS`：同一 IP 在一个窗口内最多请求次数，默认 30 次。

## DeepSeek 自测

复制 `.env.example` 为 `.env.local` 并填入 `DEEPSEEK_API_KEY` 后，可以先运行：

```bash
npm run test:deepseek
```

如果返回 JSON，说明模型名、API Key、JSON 输出模式和网络访问都正常。随后重启 `npm run dev`，网页会自动从 mock 模式切换到 DeepSeek 模式。

## 上线部署

国内临时展示推荐使用 NATAPP 内网穿透，不需要购买服务器或域名。详细步骤见：

[DEPLOYMENT.md](./DEPLOYMENT.md)

## 输出字段

- 序号
- 评论文本
- 分数
- 情感倾向
- 置信度
- 状态
- 错误信息
