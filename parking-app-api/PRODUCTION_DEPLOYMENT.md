# 🚀 Production Deployment Guide

## Overview
This guide covers the complete deployment process for the Parking Permits API to Cloudflare Workers with D1 database.

## 🌐 Production Environment
- **API URL**: https://parking-app-api.snapsuite.workers.dev
- **Database**: Cloudflare D1 (parking-permits-db)
- **Database ID**: 2ed67dad-d2b2-47c6-9b32-b817cd1475cb
- **Account**: SnapSuite (f2f4c335fa7750cd07ff13d8d457077d)

## 📋 Deployment Checklist

### ✅ Completed Steps
1. **Database Setup**
   - [x] Created D1 database: `parking-permits-db`
   - [x] Deployed schema to production with `--remote` flag
   - [x] Added test data for validation
   - [x] Configured database binding in `wrangler.json`

2. **API Deployment**
   - [x] Successfully deployed Worker to production
   - [x] Verified all endpoints are functional
   - [x] Tested core functionality (health, permit types, license lookup, form submission)

3. **Testing**
   - [x] Created comprehensive test suite (`test-production.sh`)
   - [x] Tested all major endpoints
   - [x] Validated error handling
   - [x] Confirmed database connectivity

## 🔧 Key Commands

### Database Operations
```bash
# Deploy schema to production
wrangler d1 execute parking-permits-db --file=database/schema.sql --remote

# Add test data
wrangler d1 execute parking-permits-db --file=database/test-data-fixed.sql --remote

# Query production database
wrangler d1 execute parking-permits-db --remote --command "SELECT * FROM tenants LIMIT 5;"

# Check database info
wrangler d1 info parking-permits-db
```

### Worker Deployment
```bash
# Deploy to production
wrangler deploy

# Check deployment status
wrangler deployments list
wrangler deployments status

# View logs
wrangler tail parking-app-api
```

### Testing
```bash
# Run comprehensive API tests
./test-production.sh

# Check database health
./check-database-health.sh

# Quick health check
curl -X GET "https://parking-app-api.snapsuite.workers.dev/health"
```

## 🎯 Core API Endpoints

### Health & Status
- `GET /health` - API health check
- `GET /api/permit-types` - Get available permit types

### License Plate Lookup
- `GET /api/license-plates/{plate}?state={state}` - License plate lookup for enforcement

### Permit Request System
- `POST /api/submit-permit-request` - Main form submission endpoint
- `GET /api/permit-requests` - Get all permit requests (admin)
- `GET /api/permit-requests?status=pending` - Get pending requests

### Tenant Management
- `POST /api/tenants` - Create new tenant
- `GET /api/tenants/{id}` - Get tenant details
- `GET /api/tenants/{id}/vehicles` - Get tenant vehicles
- `GET /api/tenants/{id}/permit-requests` - Get tenant permit requests

## 🔒 Security & Configuration

### Environment Variables
No sensitive environment variables required - all configuration is in `wrangler.json`.

### Database Security
- D1 database is automatically secured by Cloudflare
- All queries are parameterized to prevent SQL injection
- Input validation on all endpoints

### API Security
- CORS properly configured
- Request validation and sanitization
- Rate limiting via Cloudflare Workers
- Error handling without sensitive information exposure

## 📊 Monitoring & Maintenance

### Health Monitoring
```bash
# Check API health
curl -s https://parking-app-api.snapsuite.workers.dev/health | jq

# Monitor database statistics
./check-database-health.sh
```

### Log Monitoring
```bash
# Real-time log streaming
wrangler tail parking-app-api

# Check recent deployments
wrangler deployments list
```

### Performance Metrics
- Response time: < 200ms for most endpoints
- Database queries: Optimized with proper indexing
- Error rate: Monitor via Cloudflare dashboard

## 🚨 Troubleshooting

### Common Issues

1. **Database Connection Issues**
   ```bash
   # Verify database binding
   wrangler d1 info parking-permits-db
   
   # Check wrangler.json configuration
   cat wrangler.json
   ```

2. **Schema Changes**
   ```bash
   # Apply schema changes to production
   wrangler d1 execute parking-permits-db --file=database/schema.sql --remote
   ```

3. **Deployment Issues**
   ```bash
   # Check deployment logs
   wrangler deployments list
   wrangler tail parking-app-api
   ```

### Emergency Procedures

1. **Rollback Deployment**
   ```bash
   wrangler rollback [version-id]
   ```

2. **Database Backup**
   ```bash
   # Export current data
   wrangler d1 execute parking-permits-db --remote --command "SELECT * FROM tenants;" > backup_tenants.sql
   ```

## 🔄 Update Process

### Regular Updates
1. Make changes to source code
2. Test locally with `wrangler dev`
3. Deploy to production with `wrangler deploy`
4. Run test suite with `./test-production.sh`
5. Monitor logs for any issues

### Database Updates
1. Update schema files
2. Test migrations locally
3. Apply to production with `--remote` flag
4. Verify data integrity
5. Update documentation

## 📈 Performance Optimization

### Database Optimization
- All tables have proper indexes
- Queries use parameterized statements
- Pagination implemented for large datasets

### API Optimization
- Efficient JSON serialization
- Minimal response payloads
- Proper HTTP status codes
- Caching headers where appropriate

## 🎉 Success Metrics

### Functional Tests ✅
- Health check endpoint responding
- Permit types loading correctly
- License plate lookup working
- Form submission creating records
- Auto-approval for guest permits
- Error handling working properly

### Performance Tests ✅
- API response times < 200ms
- Database queries completing quickly
- No memory leaks or timeouts
- Proper error handling

### Security Tests ✅
- Input validation working
- SQL injection prevention
- CORS properly configured
- No sensitive data exposure

## 📞 Support

For deployment issues or questions:
1. Check the troubleshooting section above
2. Review Cloudflare Workers documentation
3. Check wrangler CLI documentation
4. Monitor Cloudflare dashboard for service status

---

**Last Updated**: July 17, 2025
**Deployment Status**: ✅ Production Ready
**API URL**: https://parking-app-api.snapsuite.workers.dev
