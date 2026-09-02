
# � Media Automation Docker Compose Stack

This repository contains a secure, maintainable Docker Compose stack to deploy a full media automation suite using GitOps best practices. The stack includes VPN protection (Gluetun), indexers, downloaders, and media managers for TV, movies, music, books, comics, and more.

---

## 🚀 Features

- 🔒 All traffic routed through Gluetun VPN
- � Automated media management: Sonarr, Radarr, Lidarr, LazyLibrarian, Mylar
- � Indexers: Prowlarr (+ FlareSolverr for Cloudflare-protected trackers)
- ⬇️ Downloaders: qBittorrent, SABnzbd
- � Subtitles: Bazarr
- � Profile sync: Recyclarr
- 📦 Archive extraction: Unpackerr
- 🧹 Stalled/failed download cleanup: Cleanuparr
- 🧪 Justfile for CLI tasks
- 🧱 Modular folder structure for growth

---

## 🧰 Project Setup

1. **Clone the repository:**

   ```bash
   git clone https://github.com/kpeacocke/gitops-dvr-stack.git
   cd gitops-dvr-stack
   ```

2. **Set up the local environment:**

   - Install [`direnv`](https://direnv.net) and [`just`](https://github.com/casey/just)
   - Allow env loading:

     ```bash
     direnv allow
     ```

   - Create local config (if needed):

     ```bash
     cp stack/.env.sample stack/.env
     ```

3. **Configure VPN credentials:**

   - Set `OPENVPN_USER` and `OPENVPN_PASSWORD` in your environment or `.env` file for Gluetun.

4. **Deploy the stack:**

   ```bash
   just deploy
   ```

5. **Install and use pre-commit hooks:**

   ```bash
   pip install pre-commit
   pre-commit install
   pre-commit run --all-files
   ```

---

## 🔄 GitOps Flow

This stack uses **Portainer GitOps** for automated deployments. All changes must go through a Pull Request:

```text
feature/* → Pull Request → main → GitHub Actions → Portainer Webhook → Auto Deploy
```

When changes are merged to `main`, GitHub Actions automatically triggers the Portainer webhook to pull and deploy the latest stack configuration.

🚫 Direct commits to `main` are disabled by branch protection rules.

For detailed GitOps setup and troubleshooting, see [PORTAINER_GITOPS.md](./docs/PORTAINER_GITOPS.md).

---

## 🧪 Validate & Deploy

```bash
just validate           # Validate the stack
just deploy             # Deploy stack locally
just down               # Tear down local stack
just portainer-deploy   # Trigger Portainer GitOps deployment
just portainer-webhook  # Show Portainer webhook URL
```

### Local Development

For local testing before pushing to production via Portainer:

```bash
# Test changes locally
cp stack/.env.sample stack/.env
# Edit stack/.env with your values
just validate
just deploy
```

### Production Deployment

Production deployments are handled automatically via Portainer GitOps:

1. Make changes in a feature branch
2. Create Pull Request to `main`
3. After approval and merge, GitHub Actions triggers Portainer
4. Portainer pulls changes and redeploys stack

Alternatively, manually trigger deployment:

```bash
just portainer-deploy
```

---

## 📋 File Layout

```text
gitops-dvr-stack/
├── stack/                  # Compose files and config templates
│   └── docker-compose.yml  # Main stack definition
├── Justfile                # CLI task runner
├── .envrc                  # direnv integration
├── LICENSE                 # License
├── SECURITY.md             # Security policy
├── README.md               # This file
```

---

## 📄 License

This project is licensed under the [MIT License](./LICENSE).

---

## 🛡️ Security

Please review [SECURITY.md](./SECURITY.md) and report concerns to [krpeacocke@gmail.com](mailto:krpeacocke@gmail.com)

## 🖥️ Included Services

| Service        | Description                       | Default Port |
|--------------- |-----------------------------------|--------------|
| Gluetun        | VPN gateway (PIA)                 | 7878, 8080, etc |
| Prowlarr       | Indexer manager                   | 9696         |
| FlareSolverr   | Cloudflare challenge solver       | 8191 (internal) |
| SABnzbd        | Usenet downloader                 | 8080         |
| qBittorrent    | Torrent downloader                | 8081         |
| Sonarr         | TV automation                     | 8989         |
| Radarr         | Movie automation                  | 7878         |
| Bazarr         | Subtitles automation              | 6767         |
| Lidarr         | Music automation                  | 8686         |
| Mylar          | Comics automation                 | 8090         |
| LazyLibrarian  | Book/audiobook automation         | 5299         |
| Recyclarr      | Quality profile sync              | N/A          |
| Cleanuparr     | Stalled/failed download cleanup   | 11011        |
| Unpackerr      | Archive extraction                | N/A          |

All services are routed through Gluetun VPN for privacy.

---
