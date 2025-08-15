deploy:
  docker compose -f stack/docker-compose.yml --env-file stack/.env up -d

validate:
  docker compose -f stack/docker-compose.yml config

down:
  docker compose -f stack/docker-compose.yml down
