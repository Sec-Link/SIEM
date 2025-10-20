# SIEM 多租户告警与工单平台

## 后端结构
- users: 用户与租户 (tenant_id) 管理，JWT 登录
- es_integration: 告警查询与仪表盘聚合 (目前使用 mock_alerts.json)
- ticketing: 工单 CRUD

## API
- POST /api/v1/auth/login {username, password}
- GET /api/v1/alerts/list/?page=1&page_size=20 (需认证)
- GET /api/v1/alerts/dashboard/ (需认证)
- GET/POST/PUT/DELETE /api/v1/tickets/

## 多租户隔离
所有查询通过 request.user.profile.tenant_id 过滤，只返回该租户数据。

## 前端说明
React + Ant Design, 轮询仪表盘每 10 秒更新。

## 开发运行
```bash
# 后端
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser  # 创建用户后在admin里补充 tenant_id 或脚本方式
# 前端
npm install
npm start
```

## TODO
- 增加注册与租户创建流程
- 加入真实 Elasticsearch 客户端与查询 DSL 封装
- 使用分页与筛选增强告警列表
