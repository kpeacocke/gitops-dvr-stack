# Deployment Guide

This guide walks you through deploying the GitOps DVR Stack.

## Prerequisites

- Docker Engine 20.10 or later
- Docker Compose V2
- VPN subscription (Private Internet Access or compatible provider)
- Storage locations configured (see Configuration section)

## Quick Start

1. **Clone the repository**

   ```bash
   git clone https://github.com/kpeacocke/gitops-dvr-stack.git
   cd gitops-dvr-stack
   ```

2. **Configure environment**

   ```bash
   cp stack/.env.sample stack/.env
   ```

   Edit `stack/.env` and set your values:

   ```bash
   OPENVPN_USER=your_vpn_username
   OPENVPN_PASSWORD=your_vpn_password
   TRANSMISSION_USER=admin
   TRANSMISSION_PASS=change_me_please
   ```

3. **Adjust storage paths** (if needed)

   Edit `stack/docker-compose.yml` and update volume paths to match your system:

   ```yaml
   volumes:
     - '/your/path/config:/config'
     - '/your/path/downloads:/downloads'
   ```

4. **Deploy the stack**

   ```bash
   # Using justfile
   just deploy

   # Or directly with docker compose
   docker compose -f stack/docker-compose.yml up -d
   ```

5. **Verify deployment**

   ```bash
   # Check all services are running
   docker compose -f stack/docker-compose.yml ps

   # Check VPN connection
   docker logs gluetun | grep "IP address"

   # Check port forwarding
   cat /volume1/dkrcfg/gluetun/portfwd
   ```

## Configuration

### User/Group IDs

Find your user and group IDs:

```bash
id -u  # PUID
id -g  # PGID
```

Update in `stack/.env`:

```bash
PUID=1000
PGID=1000
```

### Timezone

Set your timezone (see [TZ database](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)):

```bash
TZ=America/New_York
```

### VPN Configuration

#### Using Private Internet Access

Default configuration works with PIA. Just set credentials:

```bash
OPENVPN_USER=p1234567
OPENVPN_PASSWORD=your_password
```

#### Using Other Providers

See [Gluetun documentation](https://github.com/qdm12/gluetun-wiki) for supported providers.

Example for NordVPN:

```yaml
environment:
  - VPN_SERVICE_PROVIDER=nordvpn
  - OPENVPN_USER=your_email
  - OPENVPN_PASSWORD=your_password
  - SERVER_COUNTRIES=Switzerland
```

### Storage Configuration

#### Synology NAS

Default paths for Synology:

```yaml
volumes:
  - '/volume1/dkrcfg/service:/config'
  - '/volume1/downloads:/downloads'
  - '/volume1/TV:/tv'
  - '/volume1/Movies:/movies'
```

#### Linux Server

Typical paths for Linux:

```yaml
volumes:
  - '/opt/docker/service:/config'
  - '/mnt/storage/downloads:/downloads'
  - '/mnt/storage/media/tv:/tv'
  - '/mnt/storage/media/movies:/movies'
```

#### macOS

Example paths for macOS:

```yaml
volumes:
  - '/Users/username/docker/service:/config'
  - '/Users/username/Downloads/dvr:/downloads'
  - '/Volumes/Media/TV:/tv'
  - '/Volumes/Media/Movies:/movies'
```

## Service Access

After deployment, access services at:

| Service        | URL                              | Default Credentials |
|---------------|-----------------------------------|---------------------|
| Sonarr        | http://your-host:8989            | None (set on first run) |
| Radarr        | http://your-host:7878            | None (set on first run) |
| Lidarr        | http://your-host:8686            | None (set on first run) |
| Readarr       | http://your-host:8787            | None (set on first run) |
| Mylar         | http://your-host:8090            | None (set on first run) |
| NZBHydra2     | http://your-host:5076            | None (set on first run) |
| Jackett       | http://your-host:9117            | None (set on first run) |
| SABnzbd       | http://your-host:8080            | None (set on first run) |
| Transmission  | http://your-host:9091            | From .env file |

## Post-Deployment Configuration

### 1. Configure Indexers

**NZBHydra2** (http://your-host:5076)
- Add your Usenet indexers
- Configure API keys
- Test connections

**Jackett** (http://your-host:9117)
- Add torrent indexers
- Copy API key for use in other services

### 2. Configure Downloaders

**SABnzbd** (http://your-host:8080)
- Add Usenet servers
- Configure categories
- Set download paths: `/downloads/complete` and `/downloads/incomplete`

**Transmission** (http://your-host:9091)
- Verify port forwarding is working
- Configure download path: `/downloads/torrents`
- Enable authentication

### 3. Configure Media Managers

For each *arr service (Sonarr, Radarr, etc.):

1. **Add Indexers**
   - Settings → Indexers → Add
   - Add NZBHydra2 (Newznab format)
   - Add Jackett indexers (Torznab format)

2. **Add Download Clients**
   - Settings → Download Clients → Add
   - Add SABnzbd with API key
   - Add Transmission with credentials

3. **Configure Media Management**
   - Settings → Media Management
   - Enable "Rename Episodes/Movies"
   - Set root folder (e.g., `/tv`, `/movies`)
   - Configure file naming

4. **Set Quality Profiles**
   - Settings → Profiles
   - Create or modify quality profiles

## Monitoring

### Check Service Health

```bash
# View all container status
docker compose -f stack/docker-compose.yml ps

# View logs for specific service
docker logs -f sonarr

# View VPN status
docker logs gluetun | grep -E "IP|VPN"
```

### Verify VPN Connection

```bash
# Check external IP through Gluetun
docker exec gluetun wget -qO- https://api.ipify.org
```

### Monitor Port Forwarding

```bash
# Check forwarded port
cat /volume1/dkrcfg/gluetun/portfwd

# Set this port in Transmission settings
```

## Troubleshooting

### Services Can't Connect

Check VPN connection:
```bash
docker logs gluetun
```

### Permission Issues

Ensure PUID/PGID match your user:
```bash
ls -la /volume1/dkrcfg/
```

### Port Conflicts

Check if ports are already in use:
```bash
netstat -tuln | grep -E '7878|8080|8989'
```

### VPN Connection Fails

1. Verify credentials in `.env`
2. Try different server region
3. Check Gluetun logs for errors

## Updating

### Update All Services

```bash
# Using justfile
just update

# Or manually
docker compose -f stack/docker-compose.yml pull
docker compose -f stack/docker-compose.yml up -d
```

### Update Specific Service

```bash
docker compose -f stack/docker-compose.yml pull sonarr
docker compose -f stack/docker-compose.yml up -d sonarr
```

## Backup

### Configuration Backup

```bash
# Backup all config
tar -czf config-backup-$(date +%Y%m%d).tar.gz /volume1/dkrcfg/

# Restore config
tar -xzf config-backup-20231201.tar.gz -C /
```

### Database Backup

Most services store their databases in the config directory. Regular backups recommended.

## Security Best Practices

1. **Use strong passwords** for all services
2. **Keep images updated** regularly
3. **Run security scans** with Trivy
4. **Monitor logs** for suspicious activity
5. **Use VPN kill switch** (enabled by default)
6. **Enable 2FA** where supported
7. **Restrict network access** to services

## Advanced Configuration

### Custom Network

To isolate services further:

```yaml
networks:
  gluetun:
    driver: bridge
    ipam:
      config:
        - subnet: 172.28.0.0/16
```

### Resource Limits

Add resource constraints:

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

### Health Checks

Add health checks for better monitoring:

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8989"]
  interval: 30s
  timeout: 10s
  retries: 3
```

## Support

For issues and questions:

- GitHub Issues: https://github.com/kpeacocke/gitops-dvr-stack/issues
- Discussions: https://github.com/kpeacocke/gitops-dvr-stack/discussions
- Email: krpeacocke@gmail.com
