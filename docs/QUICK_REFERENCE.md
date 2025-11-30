# Quick Reference

Quick reference guide for common operations with the GitOps DVR Stack.

## 🚀 Quick Start

```bash
# Clone repository
git clone https://github.com/kpeacocke/gitops-dvr-stack.git
cd gitops-dvr-stack

# Configure environment
cp stack/.env.sample stack/.env
# Edit stack/.env with your credentials

# Validate configuration
just validate

# Deploy locally
just deploy
```

## 🔄 Portainer GitOps Commands

```bash
# Trigger Portainer deployment
just portainer-deploy

# Show webhook URL
just portainer-webhook

# Manual webhook trigger
curl -X POST https://portainer.ambitiouscake.com/api/stacks/webhooks/b12d5a0d-6786-4a84-b5e1-41cf21ce1f68
```

## 🐳 Docker Commands

```bash
# View all containers
docker ps

# View specific service logs
docker logs gluetun
docker logs sonarr
docker logs radarr

# Check VPN status
docker logs gluetun | grep "IP address"

# Restart a service
docker restart sonarr

# Stop all services
just down

# Update services
docker compose -f stack/docker-compose.yml pull
docker compose -f stack/docker-compose.yml up -d
```

## 📊 Service URLs

| Service       | URL                          | Port |
|---------------|------------------------------|------|
| Sonarr        | <http://localhost:8989>        | 8989 |
| Radarr        | <http://localhost:7878>        | 7878 |
| Lidarr        | <http://localhost:8686>        | 8686 |
| Readarr       | <http://localhost:8787>        | 8787 |
| Mylar         | <http://localhost:8090>        | 8090 |
| NZBHydra2     | <http://localhost:5076>        | 5076 |
| Jackett       | <http://localhost:9117>        | 9117 |
| SABnzbd       | <http://localhost:8080>        | 8080 |
| Transmission  | <http://localhost:9091>        | 9091 |

## 🔍 Monitoring

```bash
# Check service health
docker compose -f stack/docker-compose.yml ps

# View resource usage
docker stats

# Check VPN connection
docker exec gluetun wget -qO- https://api.ipify.org

# View port forwarding
cat /volume1/dkrcfg/gluetun/portfwd
```

## 🛠️ Common Tasks

### Update All Services

```bash
docker compose -f stack/docker-compose.yml pull
docker compose -f stack/docker-compose.yml up -d
```

### Update Single Service

```bash
docker compose -f stack/docker-compose.yml pull sonarr
docker compose -f stack/docker-compose.yml up -d sonarr
```

### Backup Configurations

```bash
tar -czf backup-$(date +%Y%m%d).tar.gz /volume1/dkrcfg/
```

### View Logs

```bash
# All services
docker compose -f stack/docker-compose.yml logs

# Specific service
docker logs -f sonarr

# Last 100 lines
docker logs --tail 100 gluetun
```

## 🔧 Troubleshooting

### VPN Not Connected

```bash
# Check Gluetun logs
docker logs gluetun

# Restart Gluetun
docker restart gluetun

# Verify credentials in .env
cat stack/.env | grep OPENVPN
```

### Service Can't Start

```bash
# Check service logs
docker logs service-name

# Check container status
docker ps -a

# Recreate service
docker compose -f stack/docker-compose.yml up -d --force-recreate service-name
```

### Permission Issues

```bash
# Check PUID/PGID
id -u  # Your user ID
id -g  # Your group ID

# Update in stack/.env
# PUID=1000
# PGID=1000

# Restart services
just down
just deploy
```

## 📝 Git Workflow

### Create Feature Branch

```bash
git checkout -b feature/my-change
# Make changes
git add .
git commit -m "feat: description of change"
git push origin feature/my-change
```

### Create Pull Request

1. Go to GitHub repository
2. Click "New Pull Request"
3. Select your feature branch
4. Fill in PR template
5. Request review
6. After approval, merge to main
7. Portainer auto-deploys

### Manual Deployment Trigger

```bash
# After merge to main
just portainer-deploy
```

## 🔐 Security

### Check for Vulnerabilities

```bash
# If Trivy is installed
trivy config stack/

# Run pre-commit checks
pre-commit run --all-files
```

### Update Passwords

1. Edit `stack/.env`
2. Update passwords
3. Redeploy:

   ```bash
   just down
   just deploy
   ```

### Check VPN Leak

```bash
# Your actual IP
curl https://api.ipify.org

# VPN IP (should be different)
docker exec gluetun wget -qO- https://api.ipify.org
```

## 📚 Environment Variables

Essential variables in `stack/.env`:

```bash
# VPN
OPENVPN_USER=your_username
OPENVPN_PASSWORD=your_password
SERVER_REGIONS=Switzerland

# Transmission
TRANSMISSION_USER=admin
TRANSMISSION_PASS=change_me

# System
PUID=1027
PGID=100
TZ=Australia/Sydney
```

## 🎯 Best Practices

1. **Never commit `.env` files** - Use `.env.sample` as template
2. **Always test locally** before pushing to main
3. **Use feature branches** for all changes
4. **Run validation** before committing
5. **Monitor deployments** in Portainer UI
6. **Keep backups** of configurations
7. **Update regularly** for security patches

## 📖 Documentation Links

- [Full Architecture](./ARCHITECTURE.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [Portainer GitOps](./PORTAINER_GITOPS.md)
- [Main README](../README.md)
- [Contributing](../CONTRIBUTING.md)

## 🆘 Getting Help

- GitHub Issues: <https://github.com/kpeacocke/gitops-dvr-stack/issues>
- GitHub Discussions: <https://github.com/kpeacocke/gitops-dvr-stack/discussions>
- Email: <krpeacocke@gmail.com>

## 🔗 External Resources

- [Gluetun Wiki](https://github.com/qdm12/gluetun-wiki)
- [Sonarr Wiki](https://wiki.servarr.com/sonarr)
- [Radarr Wiki](https://wiki.servarr.com/radarr)
- [Portainer Docs](https://docs.portainer.io/)
- [Docker Compose Docs](https://docs.docker.com/compose/)
