# IG-API Project - Hermes Context

## Project Overview

Instagram REST API integration with Meta Graph API, deployed on AWS with multi-environment strategy.

## Architecture

### Tech Stack
- **Runtime**: Node.js 22 (LTS)
- **Framework**: Express.js 5
- **Infrastructure**: AWS CDK v2
- **Database**: DynamoDB (on-demand)
- **Deployment**: GitHub Actions CI/CD
- **Package Manager**: PNPM (strict requirement)

### AWS Resources (per environment)
- Lambda function (Node.js 22, 256MB, 15s timeout)
- API Gateway (REST API)
- DynamoDB table (ig-posts-{env})
- CloudWatch (logs, alarms, dashboard)
- SNS (alarm notifications)

### Environments
- **dev**: Local development (no AWS)
- **pre**: Pre-production (AWS) - branch: `pre`
- **int**: Integration (AWS) - branch: `int` (not created yet)
- **pro**: Production (AWS) - branch: `pro` (not created yet)

## Project Structure

```
/
├── src/                    # Application code
│   ├── app.js             # Express app setup
│   ├── server.js          # Local server entry
│   ├── config/            # Configuration
│   ├── middleware/        # Express middleware
│   ├── repositories/      # Data access layer
│   ├── routes/            # API endpoints
│   ├── services/          # Business logic
│   └── utils/             # Utilities
├── tests/                 # Test files (mirror src/ structure)
├── infra/                 # AWS CDK infrastructure
│   ├── bin/app.js         # CDK app entry
│   └── lib/ig-api-stack.js # Main stack
├── docs/                  # Documentation
│   ├── architecture.md    # Architecture decisions
│   ├── conventions.md     # Coding conventions
│   ├── decisions.md       # ADRs (Architecture Decision Records)
│   ├── roadmap.md         # Project roadmap
│   └── openapi.yaml       # API specification
├── progress/              # Session tracking (gitignored)
├── feature_list.json      # Feature tracking
├── AGENTS.md              # Agent workflow definitions
├── CHECKPOINTS.md         # Quality checkpoints
├── init.js                # Project validation script
└── lambda.js              # Lambda handler
```

## Key Conventions

### Code Style
- Use ES Modules (`import/export`, not `require`)
- JSDoc for all public functions
- Relative paths only (never absolute)
- Small, focused functions (single responsibility)
- Dependency injection for testability

### Testing
- All tests in `tests/` directory
- Use Node.js built-in test runner
- Mock external dependencies (DynamoDB, Meta API)
- Target: 95% code coverage
- Run: `pnpm test`

### Git Workflow
- Branch `dev`: Local development
- Branch `pre`: Pre-production (auto-deploys)
- Branch `int`: Integration (auto-deploys)
- Branch `pro`: Production (requires approval)
- Commit messages: conventional commits format

### Security
- **NEVER** commit secrets
- Use environment variables for all configuration
- GitHub Secrets for CI/CD
- AWS Systems Manager for runtime secrets (planned)

## API Endpoints

### Public
- `GET /health` - Health check
- `GET /webhooks` - Meta webhook verification
- `POST /webhooks` - Meta webhook receiver

### Protected (require X-API-Key header)
- `GET /posts` - List posts from DynamoDB
- `GET /posts/:id` - Get post by ID
- `POST /posts/sync` - Sync posts from Instagram
- `POST /posts/verify` - Verify stale posts

## Environment Variables

### Required (GitHub Secrets)
- `META_ACCESS_TOKEN` - Instagram Graph API token
- `META_IG_USER_ID` - Instagram business account ID
- `META_APP_SECRET` - Meta app secret (webhook validation)
- `META_VERIFY_TOKEN` - Webhook verification token
- `AUTH_API_KEY` - API authentication key

### Optional (with defaults)
- `APP_PORT` - Local dev port (default: 3000)
- `APP_LOG_LEVEL` - Log level (default: info)
- `APP_RATE_LIMIT_WINDOW_MS` - Rate limit window (default: 60000)
- `APP_RATE_LIMIT_MAX` - Max requests per window (default: 100)
- `DYNAMODB_POST_TTL_DAYS` - Post TTL in days (default: 90)
- `POST_VERIFICATION_HOURS` - Post verification interval (default: 24)

## Common Commands

### Development
```bash
pnpm install          # Install dependencies
pnpm dev              # Start local dev server
pnpm test             # Run tests
pnpm lint             # Run linter
pnpm test:coverage    # Run tests with coverage
```

### Infrastructure
```bash
# ⚠️ PROHIBIDO ejecutar comandos CDK desde local
# La infraestructura se despliega EXCLUSIVAMENTE desde GitHub Actions CI/CD
# Los comandos cdk synth, cdk diff y cdk deploy se ejecutan en el workflow
```

### Validation
```bash
node init.js          # Validate project structure and state
```

## Current Status

### Completed Phases
- Phase 0-7: Foundation to Webhooks
- Phase 8: Production Readiness (CloudWatch, OpenAPI, cost optimization)

### Current Phase
- Phase 9: Advanced Features (in progress)
  - FEAT-022: DynamoDB Data Model
  - FEAT-019: META Token Management (Systems Manager)
  - FEAT-020: META Token Strategy
  - ... and more

### Backlog
- FEAT-015: Load & Stress Testing (deferred)
- FEAT-017: Image Storage Strategy (pending)

## Important Notes

### DO
- Always run `pnpm test` before committing
- Update `docs/decisions.md` for architectural changes
- Use `node init.js` to validate project state
- Check `progress/current.md` for current task
- Review `feature_list.json` for task status

### DON'T
- Don't use NPM or YARN (PNPM only)
- Don't commit .env files or secrets
- Don't deploy without user approval
- Don't skip tests "for speed"
- Don't hardcode configuration values
- Don't modify files in progress/ (gitignored)

## Monitoring & Alerts

### CloudWatch Alarms (6 total)
1. Lambda errors (>= 1 in 5min)
2. Lambda throttles (>= 1 in 5min)
3. Lambda duration p95 (>= 5s)
4. API Gateway 5xx errors (>= 10 in 5min)
5. API Gateway latency p95 (>= 1s)
6. DynamoDB read throttles (> 0)

### Notifications
- SNS topic: `ig-api-{env}-alarm-topic`
- Email: antonio.lopez.sarmiento@gmail.com
- AWS Budgets: Alert at 3 EUR/month

## Cost Management

### Current Monthly Cost
- **Target**: $0/month (Free Tier)
- **Actual**: ~$0.10/month (1 CloudWatch alarm over Free Tier)

### Free Tier Limits
- Lambda: 1M requests/month, 400,000 GB-seconds
- API Gateway: 1M requests/month (first 12 months)
- DynamoDB: 25 GB storage, 25 WCU, 25 RCU
- CloudWatch: 10 metrics, 5 alarms, 3 dashboards
- S3: 5 GB storage (when implemented)

### Cost Optimization
- Lambda timeout: 15s (reduced from 30s)
- CloudWatch Logs retention: 30 days
- DynamoDB TTL: 90 days (auto-cleanup)
- On-demand capacity (no provisioned)

## Security Checklist

Before completing any task:
- [ ] No secrets in code
- [ ] No hardcoded configuration
- [ ] Environment variables used correctly
- [ ] IAM permissions follow least privilege
- [ ] API endpoints properly authenticated
- [ ] Webhook signatures validated
- [ ] Rate limiting in place
- [ ] Input validation implemented

## Troubleshooting

### Common Issues

**Tests fail after changes**
- Check if mocks are updated
- Verify dependency injection is correct
- Ensure environment variables are set

**CDK synth fails**
- Run `pnpm install` first
- Check for syntax errors in infra/
- Verify AWS credentials if deploying

**Webhook validation fails**
- Check META_APP_SECRET is set
- Verify raw body parsing is enabled
- Check signature calculation

**Lambda timeout**
- Check DynamoDB query performance
- Verify Meta API response time
- Review timeout setting (15s max)

## Resources

### Documentation
- `docs/architecture.md` - Architecture decisions
- `docs/conventions.md` - Coding conventions
- `docs/decisions.md` - ADRs
- `docs/roadmap.md` - Project roadmap
- `docs/openapi.yaml` - API specification

### Tracking
- `feature_list.json` - Feature status
- `progress/current.md` - Current task
- `progress/history.md` - Session history

### External
- AWS Console: eu-west-1 region
- GitHub: Pathles5/api-meta
- Meta Developers: Instagram Graph API
- CloudWatch: Logs and alarms
