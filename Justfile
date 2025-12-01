deploy:
  docker compose -f stack/docker-compose.yml --env-file stack/.env up -d

validate:
  docker compose -f stack/docker-compose.yml config

down:
  docker compose -f stack/docker-compose.yml down

# Trigger Portainer GitOps webhook for automated deployment
portainer-deploy:
  @echo "🚀 Triggering Portainer GitOps deployment..."
  @echo "⚠️  Webhook URL should be stored as GitHub secret PORTAINER_WEBHOOK_URL"
  @echo "🔍 Check Portainer UI for deployment status"

# Show instructions for setting up Portainer webhook
portainer-webhook:
  @echo "To set up the Portainer webhook:"
  @echo "1. Go to GitHub repo Settings > Secrets and variables > Actions"
  @echo "2. Add a new repository secret named: PORTAINER_WEBHOOK_URL"
  @echo "3. Value: https://portainer.ambitiouscake.com/api/stacks/webhooks/YOUR_WEBHOOK_ID"
  @echo "4. GitHub Actions will use this secret for deployments"
