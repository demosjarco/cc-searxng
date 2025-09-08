# syntax=docker/dockerfile:1
# https://docs.docker.com/build/dockerfile/release-notes/

# https://github.com/searxng/searxng/blob/master/Dockerfile
# https://github.com/searxng/searxng-docker/blob/master/docker-compose.yaml

FROM --platform=linux/amd64 searxng/searxng:2025.9.5-a966e10@sha256:cc71bc1283e5df297ef8b8e3beb84e656b224420c39ea259a7233bff38902298

# Generate default configuration files
COPY --link searxng/settings.yml /etc/searxng/settings.yml
COPY --link searxng/uwsgi.ini /etc/searxng/uwsgi.ini

ENV SEARXNG_BASE_URL="https://search.demosjarco.dev"

# Replace the default secret_key with a securely generated one
RUN sed -i "s|secret_key: .*|secret_key: \"$(openssl rand -hex 32)\"|" /etc/searxng/settings.yml