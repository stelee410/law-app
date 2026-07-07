# 法灵 AI 法务

一个本地可运行的法律 AI 追偿应用原型，包含：

- 移动端优先的 React 前端
- Express 后端 API
- 证据上传、案件评估、方案选择、进度跟踪闭环
- Docker Compose 本地部署

## 本地开发

```bash
npm install
npm run dev
```

前端默认运行在 `http://localhost:5173`，后端默认运行在 `http://localhost:4000`。

## Docker 部署

```bash
docker compose up --build
```

打开 `http://localhost:8080`。

## 测试

```bash
npm test
```
