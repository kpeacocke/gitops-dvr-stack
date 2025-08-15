# Security Policy

## Supported Versions

We aim to support the latest major version of the stack at all times. Older versions may be patched for critical vulnerabilities.

| Version   | Supported |
|-----------|-----------|
| `main`    | ✅        |
| `v1.x`    | ✅        |
| `v0.x`    | ❌        |

---

## Reporting a Vulnerability

If you discover a vulnerability or security concern in this repository, **please do not open a public issue**. Instead, report it privately via email:

📧 [krpeacocke@gmail.com](mailto:krpeacocke@gmail.com)

Include as much detail as possible:

- Affected components (e.g., Portainer Server, Agent, Compose file)
- Steps to reproduce
- Impact and potential remediation
- Whether the issue is already publicly known

---

## Secrets and Sensitive Data

We follow a strict **no-commit policy** for secrets:

- `.env` files must never be committed
- Use `.env.sample` for templates
- Secrets should be managed securely via:
  - Portainer Configs
  - Secret management systems (Vault, Doppler, etc.)
  - GitHub Actions secrets (for CI/CD)

---

## Dependency Security

All container images are sourced from trusted registries:

- `portainer/portainer-ce`
- `portainer/agent`

To verify:

```bash
docker image inspect portainer/portainer-ce
```

You are encouraged to:

- Pin specific image tags (portainer/portainer-ce:2.20.3)
- Use docker scan or trivy to assess vulnerabilities

---

## Security Best Practices

The following practices are recommended when using this stack:

- Do not expose Portainer Agent port 9001 to the internet
- Use HTTPS (:9443) to access the Portainer UI
- Ensure your Docker socket is only accessible via the Portainer Agent
- Limit admin access in Portainer and use RBAC if available
- Use a hashed admin password (bcrypt) in .env

---

## Vulnerability Scoring

We follow the CVSS v3.1 framework for scoring reported issues. When disclosing responsibly, please include your estimated CVSS vector string if applicable.

---

## Security Tooling Recommendations

To check your stack:

- Trivy
- Dockle
- Gitleaks
- docker scan

---

## Disclaimer

This project is maintained in good faith and intended for secure self-hosted deployments. However, you are responsible for the security of your infrastructure. Always audit and restrict exposed ports, credentials, and external integrations.
