# Docker Health Checks

This document explains the health check configuration for all containers in the GitOps DVR Stack.

## Overview

All containers now have validated health checks that monitor service availability. Health checks ensure:

- **Automatic Recovery**: Unhealthy containers can be automatically restarted
- **Dependency Management**: Services wait for Gluetun VPN to be healthy before starting
- **Monitoring**: Easy identification of failing services
- **Orchestration**: Better integration with Docker Swarm, Kubernetes, and Portainer

## Health Check Strategy

### Gluetun (VPN Gateway)

```yaml
healthcheck:
  test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:9999"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 10s
```

**Why this works:**

- Gluetun exposes an HTTP control server on port 9999
- Uses `wget` (available in the Alpine-based image)
- `--spider` mode doesn't download, just checks if accessible
- Fast startup (10s start period)

### *arr Services (Sonarr, Radarr, Lidarr, Readarr)

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8989/ping"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 90s
```

**Why this works:**

- All *arr services have a `/ping` endpoint that returns `{"status":"OK"}`
- Uses `curl` (available in LinuxServer images)
- `-f` flag makes curl fail on HTTP errors (4xx, 5xx)
- Longer start period (90s) allows database initialization

**Service-specific ports:**

- Sonarr: `http://localhost:8989/ping`
- Radarr: `http://localhost:7878/ping`
- Lidarr: `http://localhost:8686/ping`
- Readarr: `http://localhost:8787/ping`

### Download Clients (Transmission, SABnzbd)

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:9091"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 60s
```

**Why this works:**

- Checks if web UI is accessible
- Uses root endpoint (no specific health endpoint available)
- Medium start period (60s) for service initialization
- Transmission: port 9091, SABnzbd: port 8080

### Indexers (Jackett, NZBHydra2, Mylar)

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:9117"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 60s
```

**Why this works:**

- Checks web UI availability
- Uses root endpoint
- Standard start period (60s)
- Jackett: 9117, NZBHydra2: 5076, Mylar: 8090

## Health Check Parameters Explained

### `test`

The command to run. Exit code 0 = healthy, non-zero = unhealthy.

### `interval`

How often to run the health check (30 seconds for all services).

### `timeout`

Maximum time to wait for the health check command (10 seconds).

### `retries`

Number of consecutive failures before marking as unhealthy (3 attempts).

### `start_period`

Grace period during container startup before health checks count toward retries.

**Start period by service type:**

- Gluetun: 10s (fast VPN connection)
- Indexers/Downloads: 60s (web UI initialization)
- *arr services: 90s (database initialization)

## Dependency Management

All services now use the extended `depends_on` syntax:

```yaml
depends_on:
  gluetun:
    condition: service_healthy
```

**Benefits:**

- Services wait for Gluetun VPN to be fully connected
- Prevents connection failures during startup
- Ensures all traffic is properly routed through VPN
- Better startup order and reliability

## Monitoring Health Status

### Check All Services

```bash
docker compose -f stack/docker-compose.yml ps
```

Output shows health status:

- `healthy` - Service is working
- `unhealthy` - Service failed health checks
- `starting` - Within start_period, not yet checked

### Check Specific Service

```bash
docker inspect --format='{{.State.Health.Status}}' sonarr
```

### View Health Check Logs

```bash
docker inspect --format='{{json .State.Health}}' sonarr | jq
```

### Watch Health Status

```bash
watch -n 2 'docker compose -f stack/docker-compose.yml ps'
```

## Troubleshooting

### Service Shows Unhealthy

1. **Check service logs:**

   ```bash
   docker logs sonarr
   ```

2. **Check health check logs:**

   ```bash
   docker inspect sonarr | jq '.[0].State.Health.Log'
   ```

3. **Manually test health check:**

   ```bash
   docker exec sonarr curl -f http://localhost:8989/ping
   ```

### Services Stuck in Starting

- Check if Gluetun is healthy: `docker ps | grep gluetun`
- View Gluetun logs: `docker logs gluetun`
- Ensure VPN credentials are correct
- Check VPN connection status

### Health Check Fails But Service Works

If service works but health check fails:

1. **Verify curl/wget is installed:**

   ```bash
   docker exec service-name which curl
   ```

2. **Test endpoint manually:**

   ```bash
   docker exec service-name curl -v http://localhost:PORT
   ```

3. **Check for authentication requirements:**
   Some services may require authentication on health endpoints.

### Network Mode Considerations

Since all services (except Gluetun) use `network_mode: "service:gluetun"`:

- They share Gluetun's network namespace
- Health checks use `localhost` (not container names)
- All services are accessible through Gluetun's ports
- If Gluetun is unhealthy, all services will be affected

## Testing Health Checks

### Test Configuration

```bash
# Validate compose file
docker compose -f stack/docker-compose.yml config

# Start services
docker compose -f stack/docker-compose.yml up -d

# Watch health status
watch -n 2 'docker compose -f stack/docker-compose.yml ps'
```

### Manual Health Check Tests

```bash
# Test Gluetun
docker exec gluetun wget --no-verbose --tries=1 --spider http://localhost:9999

# Test Sonarr
docker exec sonarr curl -f http://localhost:8989/ping

# Test Radarr
docker exec radarr curl -f http://localhost:7878/ping

# Test Transmission
docker exec transmission curl -f http://localhost:9091

# Test Jackett
docker exec jackett curl -f http://localhost:9117
```

## Health Check Best Practices

### For This Stack

1. **Always wait for Gluetun:** All services depend on `service_healthy` condition
2. **Monitor startup:** Initial deployment may take 2-3 minutes for all services
3. **Check VPN first:** If services fail, check Gluetun health first
4. **Use longer timeouts:** *arr services need time to initialize databases

### General Best Practices

1. **Lightweight checks:** Use simple HTTP GET requests
2. **Don't check dependencies:** Health check should only verify the service itself
3. **Appropriate intervals:** 30s is good for these services
4. **Adequate start periods:** Allow time for initialization
5. **Use specific endpoints:** Prefer `/ping` or `/health` over root URLs

## Integration with Orchestration

### Docker Compose

Health checks are automatically used by Docker Compose:

- `docker compose up` respects `depends_on` with health conditions
- `docker compose ps` shows health status
- Services restart if they become unhealthy (with `restart: always`)

### Portainer

Portainer displays health status:

- Green dot: healthy
- Red dot: unhealthy
- Yellow dot: starting
- Gray dot: no health check

Health status appears in:

- Container list
- Stack details
- Container details

### Docker Swarm

If deploying to Swarm, health checks enable:

- Rolling updates (only update healthy replicas)
- Automatic failover
- Load balancer integration

## Performance Impact

Health checks have minimal impact:

- **CPU:** Negligible (simple curl/wget command)
- **Memory:** < 1MB per check
- **Network:** Local requests only (no external traffic)
- **Frequency:** 30s interval is conservative

**Estimated overhead per service:**

- ~2-3% CPU during check execution
- < 5MB memory
- < 100ms execution time

## Customization

### Adjust Check Frequency

To check more/less often:

```yaml
healthcheck:
  interval: 60s  # Check every minute instead of 30s
```

### Stricter Health Requirements

To be more sensitive to failures:

```yaml
healthcheck:
  retries: 1     # Fail after 1 unsuccessful attempt
  timeout: 5s    # Shorter timeout
```

### Longer Grace Period

For slower systems:

```yaml
healthcheck:
  start_period: 120s  # Allow 2 minutes startup time
```

### Disable Health Check

To disable for a specific service:

```yaml
healthcheck:
  disable: true
```

## Health Check Endpoints Reference

| Service       | Port | Endpoint                | Method | Response                |
|---------------|------|-------------------------|--------|-------------------------|
| Gluetun       | 9999 | /                       | GET    | HTTP 200                |
| Sonarr        | 8989 | /ping                   | GET    | {"status":"OK"}         |
| Radarr        | 7878 | /ping                   | GET    | {"status":"OK"}         |
| Lidarr        | 8686 | /ping                   | GET    | {"status":"OK"}         |
| Readarr       | 8787 | /ping                   | GET    | {"status":"OK"}         |
| Transmission  | 9091 | /                       | GET    | HTML (web UI)           |
| SABnzbd       | 8080 | /                       | GET    | HTML (web UI)           |
| Jackett       | 9117 | /                       | GET    | HTML (web UI)           |
| NZBHydra2     | 5076 | /                       | GET    | HTML (web UI)           |
| Mylar         | 8090 | /                       | GET    | HTML (web UI)           |

## Automation

### Restart Unhealthy Services

```bash
#!/bin/bash
# restart-unhealthy.sh

for service in $(docker compose -f stack/docker-compose.yml ps --format json | jq -r 'select(.Health == "unhealthy") | .Service'); do
  echo "Restarting unhealthy service: $service"
  docker compose -f stack/docker-compose.yml restart $service
done
```

### Alert on Unhealthy Services

```bash
#!/bin/bash
# check-health.sh

unhealthy=$(docker compose -f stack/docker-compose.yml ps --format json | jq -r 'select(.Health == "unhealthy") | .Service')

if [ -n "$unhealthy" ]; then
  echo "ALERT: Unhealthy services detected: $unhealthy"
  # Send notification (email, Slack, etc.)
fi
```

## References

- [Docker Health Check Documentation](https://docs.docker.com/engine/reference/builder/#healthcheck)
- [Docker Compose Health Check](https://docs.docker.com/compose/compose-file/compose-file-v3/#healthcheck)
- [Depends On Conditions](https://docs.docker.com/compose/compose-file/compose-file-v3/#depends_on)

## Summary

All services now have:

- ✅ Validated health checks using appropriate tools (curl/wget)
- ✅ Proper dependency management (wait for Gluetun)
- ✅ Appropriate timeouts and intervals
- ✅ Service-specific start periods
- ✅ Tested and validated configuration

The health checks ensure reliable startup, better monitoring, and automatic recovery of failed services.
