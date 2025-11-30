deploy:
  docker compose -f stack/docker-compose.yml --env-file stack/.env up -d

validate:
  docker compose -f stack/docker-compose.yml config

down:
  docker compose -f stack/docker-compose.yml down

# Trigger Portainer GitOps webhook for automated deployment
portainer-deploy:
  @echo "🚀 Triggering Portainer GitOps deployment..."
  @curl -X POST https://portainer.ambitiouscake.com/api/stacks/webhooks/b12d5a0d-6786-4a84-b5e1-41cf21ce1f68
  @echo "\n✅ Portainer webhook triggered - check Portainer UI for status"

# Show Portainer webhook URL
portainer-webhook:
  @echo "Portainer Webhook URL:"
  @echo "https://portainer.ambitiouscake.com/api/stacks/webhooks/b12d5a0d-6786-4a84-b5e1-41cf21ce1f68"

