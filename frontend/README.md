# SIEM 前端

使用 React + TypeScript + Ant Design 展示多租户告警与工单系统。

## 页面
- 登录页：输入用户名密码获取 JWT
- 仪表盘：每 10 秒轮询后台获取聚合数据
- 告警列表：展示当前租户告警
- 工单页：查看与新建工单

## 启动
```bash
npm install
npm start
```
访问 http://localhost:3000

## 配置
webpack devServer 已配置 `/api` 代理到后端 `http://localhost:8000`

## 类型
见 `src/types.ts`
