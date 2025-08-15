
# � Media Automation Docker Compose Stack

This repository contains a secure, maintainable Docker Compose stack to deploy a full media automation suite using GitOps best practices. The stack includes VPN protection (Gluetun), indexers, downloaders, and media managers for TV, movies, music, books, comics, and more.

---


## 🚀 Features

- 🔒 All traffic routed through Gluetun VPN
- � Automated media management: Sonarr, Radarr, Lidarr, Readarr, Mylar
- � Indexers: NZBHydra2, Jackett
- ⬇️ Downloaders: Transmission, SABnzbd
- 🗂️ Heimdall dashboard for easy access
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

All changes must go through a Pull Request:

```text
feature/* → Pull Request → main
```

🚫 Direct commits to `main` are disabled by branch protection rules.

---


## 🧪 Validate & Deploy Locally

```bash
just validate   # Validate the stack
just deploy     # Deploy stack
just down       # Tear down
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
| NZBHydra2      | Usenet indexer aggregator         | 5076         |
| Jackett        | Torrent indexer                   | 9117         |
| SABnzbd        | Usenet downloader                 | 8080         |
| Transmission   | Torrent downloader                | 9091         |
| Sonarr         | TV automation                     | 8989         |
| Radarr         | Movie automation                  | 7878         |
| Lidarr         | Music automation                  | 8686         |
| Mylar          | Comics automation                 | 8090         |
| Readarr        | Book automation                   | 8787         |
| Heimdall       | Dashboard                         | 444          |

All services (except Heimdall) are routed through Gluetun VPN for privacy.

---
