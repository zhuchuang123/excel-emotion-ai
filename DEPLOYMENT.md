# 部署说明

## 公网访问方式

公网外部访问必须把项目部署到公网平台。不要使用本机 IP、局域网 IP 或内网穿透作为正式展示地址。

推荐最终形态：

```text
用户浏览器
  -> Vercel 公网网址
  -> Vercel Serverless API
  -> DeepSeek API
```

你的电脑只负责开发和提交代码，不作为公网服务器。

## 推荐方式

使用 Git + Vercel 部署。用户只需要打开浏览器访问 `*.vercel.app` 地址即可使用，不需要本地安装运行环境。

## 部署前准备

1. 将项目初始化为 Git 仓库。
2. 推送到 GitHub、GitLab、Bitbucket 或 Azure DevOps。
3. 在 Vercel 导入该仓库。

如果代码只放在 Gitee，可以先同步到 Vercel 支持的 Git 平台，或者使用 Vercel CLI 手动部署。

## Vercel 项目配置

Vercel 通常会自动识别 Next.js 项目，不需要手动指定构建命令。项目根目录保持不变即可。

如果你不会配置环境变量，可以先跳过本节直接 Deploy。部署后的页面会提供 `DeepSeek API Key` 输入框，填入 Key 后也能分析。

在 Project Settings 中配置环境变量：

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_MODEL`
- `DEEPSEEK_TIMEOUT_MS`
- `ACCESS_CODE`
- `ALLOWED_ORIGINS`
- `MAX_ITEMS_PER_REQUEST`
- `MAX_TEXT_LENGTH`
- `RATE_LIMIT_WINDOW_MS`
- `RATE_LIMIT_MAX_REQUESTS`

其中 `ALLOWED_ORIGINS` 建议填入你实际的线上网址，例如：

```text
https://excel-emotion-ai.vercel.app
```

如果前后端同域部署，`ALLOWED_ORIGINS` 也可以留空。

建议线上环境变量示例：

```text
DEEPSEEK_API_KEY=你的 DeepSeek Key
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_TIMEOUT_MS=30000
ACCESS_CODE=你自己的强访问码，不要使用 demo2026
ALLOWED_ORIGINS=https://你的项目名.vercel.app
MAX_ITEMS_PER_REQUEST=20
MAX_TEXT_LENGTH=500
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=30
```

## 部署流程

1. 完成代码提交。
2. 在 Vercel 创建新项目并导入仓库。
3. 填写环境变量。
4. 点击 Deploy。
5. 部署完成后，使用生成的 `vercel.app` 地址访问。

部署成功后，任何能访问互联网的电脑都可以打开该 `vercel.app` 地址；不需要在你的电脑上运行 `npm run dev`。

## 不配置环境变量的用法

这种方式最简单：

1. 在 Vercel 直接 Deploy。
2. 打开生成的公网网址。
3. 在页面的 `DeepSeek API Key` 输入框里填入 Key。
4. 上传 Excel 并分析。

这种方式不会把 Key 写入 GitHub，也不会保存在服务器；但每次换浏览器或刷新页面后可能需要重新填写。它适合演示和临时使用。

如果希望别人打开网页就能分析、无需知道 DeepSeek Key，则必须在 Vercel 后台配置 `DEEPSEEK_API_KEY` 环境变量。

## 本地联调

如果你已经在 Vercel 配置好了环境变量，可以用：

```bash
vercel pull
```

同步本地开发环境变量。

## 推送到远程仓库

初始化完成后，常见命令如下：

```bash
git add .
git commit -m "Initial Excel emotion analysis platform"
git branch -M main
git remote add origin 你的远程仓库地址
git push -u origin main
```

项目已经忽略 `.env`、`.env.local`、`node_modules`、`.next` 和本地 `data` 目录中的样本表格，避免把 API Key、依赖缓存和本地数据推到远程仓库。

## 验证清单

- 首页可打开
- Excel / CSV 可上传
- 结果可批量分析
- 结果可导出
- DeepSeek API 可用时切换到真实分析
- 外部来源请求被拒绝

## 临时公网演示

如果只是临时给外部人员看，也可以用 Cloudflare Tunnel、ngrok 等工具把本地服务映射到公网。但这种方式本质上仍然依赖你的电脑在线运行，不建议作为正式方案。
