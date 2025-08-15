# Contributing Guide

Thanks for contributing to the Portainer GitOps project!

---

## 🔁 GitOps Branching Policy

- **Only Pull Requests to `main` are allowed**
- Create your changes in a `feature/*` branch
- Open a PR — no direct commits to `main` are permitted

---

## 🧰 Local Setup

```bash
git clone https://github.com/YOUR_USERNAME/portainer-deploy.git
cd portainer-deploy
direnv allow
cp stack/.env.sample stack/.env
just deploy
```

Install and enable pre-commit:

```bash
pip install pre-commit
pre-commit install
```

---

## ✅ Before Opening a PR

- [ ] You created a `feature/*` branch
- [ ] You ran `pre-commit run --all-files`
- [ ] You tested with `just deploy` / `just validate`
- [ ] You **did not** commit secrets or `.env`

---

## 🧪 Recommended Commands

```bash
just validate         # YAML and compose validation
pre-commit run --all-files
just deploy           # Spin up the stack
just down             # Clean up
```

---

## 📫 Questions?

Contact [krpeacocke@gmail.com](mailto:krpeacocke@gmail.com) or open an issue.
