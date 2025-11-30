# Architecture

This document describes the architecture of the GitOps DVR Stack.

## Overview

The GitOps DVR Stack is a Docker Compose-based media automation platform that routes all traffic through a VPN gateway (Gluetun) for privacy and security.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Host Network                          │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │              Gluetun VPN Container                  │    │
│  │         (Network Gateway for all services)          │    │
│  │                                                      │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐         │    │
│  │  │ Sonarr   │  │ Radarr   │  │ Lidarr   │         │    │
│  │  │ :8989    │  │ :7878    │  │ :8686    │         │    │
│  │  └──────────┘  └──────────┘  └──────────┘         │    │
│  │                                                      │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐         │    │
│  │  │ Readarr  │  │  Mylar   │  │ NZBHydra │         │    │
│  │  │ :8787    │  │ :8090    │  │ :5076    │         │    │
│  │  └──────────┘  └──────────┘  └──────────┘         │    │
│  │                                                      │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐         │    │
│  │  │ Jackett  │  │ SABnzbd  │  │Transmis- │         │    │
│  │  │ :9117    │  │ :8080    │  │sion :9091│         │    │
│  │  └──────────┘  └──────────┘  └──────────┘         │    │
│  │                                                      │    │
│  └────────────────────────────────────────────────────┘    │
│                            │                                 │
│                            ▼                                 │
│                   ┌─────────────────┐                       │
│                   │  VPN Provider   │                       │
│                   │  (PIA, etc.)    │                       │
│                   └─────────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

## Components

### VPN Gateway (Gluetun)

- **Purpose**: Routes all traffic through a VPN connection
- **Provider**: Private Internet Access (PIA)
- **Features**:
  - Port forwarding support
  - Kill switch
  - DNS leak protection
  - Ad/malware/surveillance blocking
  - Automatic region selection

### Media Management (The *arr Suite)

- **Sonarr**: TV show automation
- **Radarr**: Movie automation
- **Lidarr**: Music automation
- **Readarr**: Book automation
- **Mylar**: Comic book automation

### Indexers

- **NZBHydra2**: Usenet indexer aggregator
- **Jackett**: Torrent indexer proxy

### Downloaders

- **SABnzbd**: Usenet downloader
- **Transmission**: Torrent downloader with VPN port forwarding

## Network Architecture

All services except Heimdall use `network_mode: "service:gluetun"`, which means:

1. They share the Gluetun container's network namespace
2. All their traffic is automatically routed through the VPN
3. They're accessible via ports exposed on the Gluetun container
4. If the VPN connection drops, the services lose network access (kill switch)

## Data Flow

```
Internet ← VPN → Gluetun → Indexers → Downloaders → Media Managers → Storage
```

1. Media managers (Sonarr, Radarr, etc.) search for content via indexers
2. Indexers query trackers/usenet providers through the VPN
3. Media managers send downloads to downloaders
4. Downloaders fetch content through the VPN
5. Completed downloads are organized and moved to storage

## Security Layers

1. **VPN Encryption**: All traffic encrypted via OpenVPN
2. **Kill Switch**: Network disconnects if VPN drops
3. **DNS Protection**: Custom DNS servers prevent leaks
4. **No New Privileges**: Container security opt prevents privilege escalation
5. **Content Blocking**: Built-in ad/malware/surveillance blocking

## Storage

- `/volume1/dkrcfg/`: Configuration files
- `/volume1/downloads/`: Download staging area
- `/volume1/TV/`, `/volume1/Movies/`, etc.: Final media storage
- `/volumeUSB1/usbshare/`: External USB storage for comics/books

## Environment Variables

Key configuration is managed via environment variables:

- `OPENVPN_USER` / `OPENVPN_PASSWORD`: VPN credentials
- `PUID` / `PGID`: User/group IDs for file permissions
- `TZ`: Timezone for scheduling
- `SERVER_REGIONS`: VPN server location

## Monitoring

- Port forwarding status: `/gluetun/portfwd`
- VPN status: Gluetun logs
- Service health: Docker container status

## Scalability

The stack can be extended by:

1. Adding new services to the Gluetun network
2. Running multiple stacks for different regions
3. Adding additional storage volumes
4. Implementing load balancing for downloaders

## Maintenance

- **Updates**: Pull new images and recreate containers
- **Backups**: Config directories should be backed up regularly
- **Monitoring**: Check VPN connection status and service logs
- **Security**: Keep images updated and review Trivy scan results
