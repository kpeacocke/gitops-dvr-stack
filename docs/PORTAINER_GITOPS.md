# Portainer GitOps Integration

This document describes how the GitOps DVR Stack integrates with Portainer for automated deployments.

## Overview

The stack uses Portainer's GitOps functionality to automatically deploy changes when pushed to the `main` branch. This provides:

- **Automated Deployments**: Changes to the stack are automatically deployed
- **Version Control**: All stack changes are tracked in Git
- **Rollback Capability**: Easy rollback to previous versions via Git
- **Audit Trail**: Complete history of all changes
- **CI/CD Integration**: GitHub Actions triggers deployments

## Architecture

```text
GitHub Repository (main branch)
        ↓
   Push/Merge PR
        ↓
 GitHub Actions Workflow
        ↓
   Trigger Webhook
        ↓
Portainer GitOps Pull
        ↓
  Docker Deployment
```

## Webhook Configuration

### Webhook URL

The webhook URL is stored as a GitHub secret `PORTAINER_WEBHOOK_URL` for security.

**Format:**
```text
https://portainer.ambitiouscake.com/api/stacks/webhooks/{WEBHOOK_ID}
```

**Setup:** See [GitHub Configuration](#github-configuration) section below.

### Trigger Conditions

The webhook is triggered when:

1. Changes are pushed to the `main` branch
2. Changes affect files in the `stack/` directory
3. The workflow file itself is modified
4. Manual workflow dispatch is triggered

## GitHub Actions Workflow

The workflow is defined in [`.github/workflows/portainer-deploy.yml`](../.github/workflows/portainer-deploy.yml).

### Workflow Features

- **Automatic**: Triggers on push to main
- **Path Filtering**: Only runs when stack files change
- **Manual Trigger**: Can be manually dispatched from GitHub UI
- **Simple**: Single curl command to trigger Portainer

### Workflow Configuration

```yaml
on:
  push:
    branches:
      - main
    paths:
      - 'stack/**'
  workflow_dispatch:
```

## Setup Instructions

### Prerequisites

1. Portainer instance running and accessible
2. Stack configured in Portainer with GitOps enabled
3. GitHub repository connected to Portainer
4. Webhook URL generated in Portainer

### Portainer Configuration

1. **Create/Update Stack in Portainer**
   - Navigate to Stacks
   - Create new stack or edit existing
   - Enable "GitOps updates"

2. **Configure Repository Settings**
   - Repository URL: `https://github.com/kpeacocke/gitops-dvr-stack`
   - Branch: `main`
   - Compose file path: `stack/docker-compose.yml`
   - Enable "Automatic updates"

3. **Generate Webhook**
   - In stack settings, generate webhook
   - Copy the webhook URL
   - Format: `https://portainer.ambitiouscake.com/api/stacks/webhooks/{id}`

4. **Environment Variables**
   - Configure environment variables in Portainer
   - Set VPN credentials, passwords, etc.
   - These override `.env` file values

### GitHub Configuration

1. **Add Workflow File**
   - Already created at `.github/workflows/portainer-deploy.yml`
   - Uses GitHub secret for webhook URL

2. **Repository Secrets** (Required)
   - Go to: `Settings` > `Secrets and variables` > `Actions`
   - Click `New repository secret`
   - Name: `PORTAINER_WEBHOOK_URL`
   - Value: `https://portainer.ambitiouscake.com/api/stacks/webhooks/{YOUR_WEBHOOK_ID}`
   - Click `Add secret`

3. **Branch Protection** (Recommended)
   - Enable branch protection for `main`
   - Require PR reviews
   - Require status checks to pass

## Usage

### Automatic Deployment

1. Make changes to files in `stack/` directory
2. Commit and push to a feature branch
3. Create Pull Request to `main`
4. After review and merge, GitHub Actions automatically triggers
5. Portainer pulls latest changes and redeploys stack

### Manual Deployment

#### Via GitHub Actions

1. Go to GitHub Actions tab
2. Select "Deploy to Portainer" workflow
3. Click "Run workflow"
4. Select branch (main)
5. Click "Run workflow"

#### Via Command Line

```bash
# Trigger webhook directly (use your actual webhook URL)
curl -X POST https://portainer.ambitiouscake.com/api/stacks/webhooks/{YOUR_WEBHOOK_ID}
```

#### Via Portainer UI

1. Navigate to Stacks
2. Select your stack
3. Click "Pull and redeploy"

## Deployment Process

### What Happens During Deployment

1. **Webhook Triggered**: GitHub Actions calls Portainer webhook
2. **Git Pull**: Portainer pulls latest code from GitHub
3. **Validation**: Portainer validates docker-compose.yml
4. **Image Pull**: Pulls any updated container images
5. **Service Update**: Updates services with new configuration
6. **Health Check**: Verifies services are running

### Deployment Strategies

#### Rolling Update (Default)

- Services updated one at a time
- Minimizes downtime
- Preserves data volumes

#### Recreate

- All services stopped then recreated
- Brief downtime
- Ensures clean state

## Monitoring Deployments

### Via Portainer UI

1. Navigate to Stacks → Your Stack
2. Check "Status" column
3. View deployment logs
4. Monitor container status

### Via GitHub Actions

1. Go to Actions tab
2. View workflow run
3. Check logs for deployment status

### Via Docker Commands

```bash
# Check stack status
docker stack ps gitops-dvr-stack

# View service logs
docker service logs gitops-dvr-stack_gluetun

# Check service status
docker service ls
```

## Troubleshooting

### Webhook Not Triggering

**Symptoms**: Push to main, but no deployment

**Solutions**:

1. Check GitHub Actions workflow runs
2. Verify webhook URL is correct
3. Check Portainer is accessible from GitHub
4. Review GitHub Actions logs

### Deployment Fails

**Symptoms**: Webhook triggers but deployment fails

**Solutions**:

1. Check Portainer logs
2. Validate docker-compose.yml locally
3. Verify environment variables in Portainer
4. Check service logs for errors

### Services Won't Start

**Symptoms**: Deployment succeeds but services fail

**Solutions**:

1. Check VPN credentials
2. Verify volume paths exist
3. Check port conflicts
4. Review service-specific logs

### Git Pull Fails

**Symptoms**: Portainer can't pull from GitHub

**Solutions**:

1. Verify repository is public or credentials are configured
2. Check GitHub is accessible from Portainer
3. Verify branch name is correct
4. Check repository URL

## Security Considerations

### Webhook Security

- Webhook URL contains authentication token
- Keep URL secret
- Don't expose in public logs
- Consider using GitHub secrets

### Environment Variables

- Store sensitive data in Portainer, not Git
- Use `.env` for defaults only
- Never commit real credentials
- Use strong passwords

### Access Control

- Limit GitHub write access
- Use branch protection
- Require PR reviews
- Enable 2FA for GitHub and Portainer

## Best Practices

### Code Review

1. All changes via Pull Requests
2. Require at least one approval
3. Run validation in CI
4. Test changes locally first

### Deployment Safety

1. Use staging environment first
2. Monitor deployments actively
3. Keep backups of configurations
4. Document all changes

### Version Control

1. Use semantic versioning for tags
2. Update CHANGELOG.md
3. Tag releases in Git
4. Document breaking changes

### Testing

1. Validate locally with `just validate`
2. Test in staging environment
3. Verify VPN connectivity
4. Check all services start

## Advanced Configuration

### Custom Webhook Authentication

If you want to secure the webhook further:

```yaml
# The workflow already uses the secret
- name: Trigger Portainer Webhook
  run: |
    curl -X POST -f ${{ secrets.PORTAINER_WEBHOOK_URL }}
```

### Multiple Environments

Deploy to different environments:

```yaml
# Staging
on:
  push:
    branches: [staging]

# Production
on:
  push:
    branches: [main]
```

### Conditional Deployments

Only deploy on specific changes:

```yaml
on:
  push:
    paths:
      - 'stack/docker-compose.yml'
      - 'stack/.env.sample'
```

### Notification Integration

Add Slack/Discord notifications:

```yaml
- name: Notify deployment
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    text: 'Stack deployed to Portainer'
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

## Rollback Procedures

### Via Git

```bash
# Revert to previous commit
git revert HEAD
git push origin main

# Redeploy automatically triggered
```

### Via Portainer

1. Navigate to Stack
2. Click "Rollback"
3. Select previous version
4. Confirm rollback

### Via Docker

```bash
# Manually rollback services
docker service update --rollback service-name
```

## Integration with Existing Tools

### Justfile Commands

Add Portainer commands to Justfile:

```makefile
# Show Portainer webhook setup instructions
portainer-webhook:
    just portainer-webhook

# Force pull and redeploy
portainer-force:
    just portainer-deploy
```

### Pre-commit Hooks

Already configured to validate before push.

## Maintenance

### Regular Tasks

- Monitor deployment logs weekly
- Review failed deployments
- Update webhook URL if changed
- Rotate credentials periodically
- Test rollback procedures

### Updates

- Keep Portainer updated
- Update GitHub Actions versions
- Review security advisories
- Test new Portainer features

## Support

For issues with:

- **GitOps Setup**: Check this documentation
- **Portainer Issues**: Refer to [Portainer docs](https://docs.portainer.io/)
- **GitHub Actions**: Check [Actions docs](https://docs.github.com/actions)
- **Stack Configuration**: See [DEPLOYMENT.md](./DEPLOYMENT.md)

## References

- [Portainer GitOps Documentation](https://docs.portainer.io/user/docker/stacks/webhooks)
- [GitHub Actions Documentation](https://docs.github.com/actions)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Project README](../README.md)
