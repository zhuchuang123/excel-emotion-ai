# 临时公网展示说明

当前推荐方案：

```text
本机运行 Next.js
  -> NATAPP 内网穿透
  -> 生成临时公网地址
  -> 同学打开公网地址访问
```

这个方案适合国内临时演示，不需要买域名、不需要备案、不需要部署到 Vercel。你的电脑必须保持开机，终端里的 NATAPP 客户端也要一直运行。

## 1. 创建 NATAPP 隧道

在 NATAPP 后台创建免费 Web 隧道：

- 协议类型：Web
- 本地地址：`127.0.0.1`
- 本地端口：`3000`

创建后复制该隧道的 `authtoken`。

## 2. 下载 NATAPP 客户端

从 NATAPP 官网下载 Windows 客户端：

```text
https://natapp.cn/download
```

解压后把 `natapp.exe` 放到：

```text
tools/natapp/natapp.exe
```

`tools/natapp` 目录已经被 Git 忽略，不会把客户端提交到仓库。

## 3. 启动临时公网展示

运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-natapp-demo.ps1 -Authtoken "你的NATAPP隧道authtoken"
```

脚本会：

- 检查本地 `3000` 端口
- 如未启动，会自动运行 `npm run dev`
- 启动 NATAPP
- 在终端显示 `Forwarding` 公网访问地址

把 `Forwarding` 后面的公网地址发给同学即可。

## 4. 演示时需要保持

- 电脑保持开机
- 本项目本地服务保持运行
- NATAPP 客户端窗口保持运行

演示结束后，关闭 NATAPP 窗口即可停止公网访问。

## 访问码和 Key

本地 `.env.local` 已配置时，同学只需要输入访问码：

```text
MIN951008
```

不要把 DeepSeek API Key 发给同学。

## Vercel 备用方案

Vercel 在国内访问不稳定，因此不作为当前推荐展示方案。它可以保留为海外访问或后续正式部署的备用方案。
