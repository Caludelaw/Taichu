# Taichu Development Roadmap

## Phase 1: Core CMS ✅ COMPLETE

**Goal**: A working headless CMS with structured content, REST API, and hook-based extension system.

| Feature | Status | Package |
|---------|--------|---------|
| Content Type Schema Definition | ✅ Done | `@taichu/core` |
| Typed Field Validation | ✅ Done | `@taichu/core` |
| Memory Store (dev/testing) | ✅ Done | `@taichu/core` |
| Hook System (lifecycle hooks) | ✅ Done | `@taichu/core` |
| Structured Error Types | ✅ Done | `@taichu/core` |
| Zero-Dependency HTTP Server | ✅ Done | `@taichu/server` |
| REST API (CRUD + list) | ✅ Done | `@taichu/server` |
| CORS Middleware | ✅ Done | `@taichu/server` |
| JSON Body Parser | ✅ Done | `@taichu/server` |
| Architecture Decision Records | ✅ Done | `docs/` |
| SQLite Store (sql.js WASM) | ✅ Done | `@taichu/core` |
| Authentication (JWT + API Key) | ✅ Done | `@taichu/core` |
| Vue 3 Admin SPA | ✅ Done | `@taichu/admin` |
| Static File Serving | ✅ Done | `@taichu/server` |

## Phase 2: AI-Native ✅ COMPLETE

**Goal**: AI agents become first-class content consumers and producers.

| Feature | Status |
|---------|--------|
| Agent API Key Authentication | ✅ Done |
| JWT Authentication (Human) | ✅ Done |
| MCP Server (stdio transport, 29 tools) | ✅ Done |
| TF-IDF Vector Search | ✅ Done |
| Content Auto-Indexing (hook-based) | ✅ Done |
| GraphQL API | ✅ Done |
| Content Pipeline Engine (3 built-in templates) | ✅ Done |
| Agent Permission Scopes | ✅ Done |
| Content Localization (ZHHK/EN/JP) | ✅ Done |
| SSO Framework (OIDC + LDAP) | ✅ Done |
| Webhook System | ✅ Done |
| Audit Logging (append-only) | ✅ Done |

## Phase 3: Ecosystem ✅ COMPLETE

**Goal**: Developer ecosystem with extensions, themes, and real-time collaboration.

| Feature | Status |
|---------|--------|
| WebSocket Real-Time Updates | ✅ Done |
| Multi-Agent Collaboration Engine | ✅ Done |
| Plugin Manager (backend) | ✅ Done |
| Theme System (custom upload, __TAICHU__ injection) | ✅ Done |
| Admin SPA (18 pages, 3 locales) | ✅ Done |
| Content Revisions (field-level diff, max 100) | ✅ Done |
| Rate Limiting (token bucket, 3 dimensions) | ✅ Done |
| Notification Channels (Feishu/DingTalk/WeCom) | ✅ Done |
| CLI (init/dev/migrate) | ✅ Done |
| Docker Support | ✅ Done |
| CI/CD (GitHub Actions + Gitee mirror) | ✅ Done |
| ESLint Code Quality | ✅ Done |

## v0.4.0 → v0.5.0 (Current)

| Feature | Priority | Status |
|---------|----------|--------|
| Server Integration Tests | P0 | ✅ Done |
| ROADMAP & Docs Update | P0 | ✅ Done |
| Brand Icon Redesign (Tai Chi ball) | P0 | ✅ Done |
| Scheduled Publishing | P1 | ✅ Done |
| Version Diff API | P1 | ✅ Done |
| Docker Compose One-Click Deploy | P1 | ✅ Done |
| Media Library Enhancement (compress/WebP/thumbs) | P1 | ✅ Done |
| Email Notification Channel | P2 | ✅ Done |
| Content Relationship Graph | P2 | ✅ Done |
| Multi-Tenant Support | P2 | ✅ Done |
| Plugin Marketplace (frontend + CLI install) | P2 | ✅ Done |
| ActivityPub Federation | P2 | ✅ Done |

## v0.5.0 → v0.6.0 ✅ RELEASED

| Feature | Priority | Status |
|---------|----------|--------|
| Dashboard Charts (content stats, trend graphs) | P1 | ✅ Done |
| Theme Frontend Pagination (blog list pages) | P1 | ✅ Done |
| Content Relationships Graph UI (admin visualization) | P1 | ✅ Done |
| Media Selector in Rich Editor | P1 | ✅ Done |
| Batch Operations (bulk delete/publish) | P2 | ✅ Done |
| Second Official Theme (minimal/portfolio) | P2 | ✅ Done |
| SSO OIDC Callback Handler | P2 | ✅ Done |
| Custom Field Types (date, boolean, reference) | P3 | ✅ Done |
| Content Export (JSON, Markdown, CSV) | P3 | ✅ Done |
| Webhook Retry with Exponential Backoff | P3 | ✅ Done |
| E2E Tests (Playwright, core flows) | P2 | ➡️ v0.7.0 |
| API Reference Documentation | P2 | ➡️ v0.7.0 |

## v0.7.0 ✅ RELEASED (2026-06-15)

| Feature | Priority | Status |
|---------|----------|--------|
| E2E Tests — Playwright core flow coverage | P1 | ✅ Done |
| Git Hooks (pre-commit lint + test) | P1 | ✅ Done |
| Code Quality Refactoring (extract utils, DRY) | P1 | ✅ Done |
| Admin Dark Mode | P2 | ✅ Done |
| Tag Management Admin UI | P2 | ✅ Done |
| Content Draft Auto-Save | P2 | ✅ Done |
| API Reference Documentation (OpenAPI) | P2 | ✅ Done |
| Plugin Developer Guide | P2 | ✅ Done |
| Admin UI Responsive Polish (mobile) | P3 | ✅ Done |
| Performance Optimization (lazy load, chunk split) | P3 | ✅ Done |
| Aliyun Docker Mirror Auto-Publish | P3 | ✅ Done |

## v0.8.0 (Current) — Production Hardening & Ecosystem Depth

**Goal**: Production readiness, observability, and deeper agent ecosystem integration.

| Feature | Priority | Status |
|---------|----------|--------|
| Health Check Endpoint (/health + /ready) | P0 | ✅ Done |
| Backup & Restore (content + config dump) | P0 | ✅ Done |
| Admin Password Reset Flow | P1 | ✅ Done |
| Content Caching Layer (ETag, Last-Modified, Cache-Control) | P1 | ✅ Done |
| Metrics & Monitoring (Prometheus /metrics endpoint) | P2 | 📋 Todo |
| Agent Marketplace: Capability Discovery API | P2 | 📋 Todo |
| CSRF Protection for Admin API | P2 | 📋 Todo |
| Content Import from Markdown/CSV/JSON | P3 | 📋 Todo |
| Federation: Cross-Instance Content Discovery | P3 | 📋 Todo |
| Zero-Config HA: Litestream Integration | P3 | 📋 Todo |

## Long-Term Vision

- **Taichu as content backbone for AI agent ecosystems** — every agent in a workflow uses Taichu as its shared content infrastructure
- **Federated content networks** — Taichu instances discover and share content via ActivityPub
- **Agent marketplace** — developers publish agent capabilities as installable extensions
- **Zero-config HA** — SQLite + Litestream for production-grade durability with single-binary simplicity
