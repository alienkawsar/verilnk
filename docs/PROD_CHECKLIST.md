# Production Checklist

## Security
- [ ] `JWT_SECRET` set
- [ ] `FRONTEND_URL` set to production domain
- [ ] CORS origins validated
- [ ] HSTS enabled (production)
- [ ] Rate limits enabled

## Data & Search
- [ ] Database migrations applied
- [ ] MeiliSearch running and indexed
- [ ] Bulk import jobs clean

## Monitoring
- [ ] Audit logs enabled
- [ ] Security events logging enabled
- [ ] Error tracking configured

## Build
- [ ] Backend build passes
- [ ] Frontend build passes
- [ ] verify-all.sh passes
