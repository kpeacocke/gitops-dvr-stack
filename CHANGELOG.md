# Changelog

## v0.2.0 (2025-12-01)

### Feat

- restructure CI/CD pipeline with Validate->Test->Release->Deploy stages and secure webhook

### Fix

- use authenticated health check for Transmission
- update Portainer webhook URL to new stack
- update healthcheck command for gluetun service in docker-compose
- update Portainer webhook URL and enhance healthcheck parameters in docker-compose

## v0.1.2 (2025-11-30)

### Fix

- resolve yamllint errors for pre-push hook

## v0.1.1 (2025-07-26)

### Fix

- Add permissions section for write access in release workflow
