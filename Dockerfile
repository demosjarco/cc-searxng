# syntax=docker/dockerfile:1
# https://docs.docker.com/build/dockerfile/release-notes/

# https://github.com/searxng/searxng/blob/master/Dockerfile
# https://github.com/searxng/searxng-docker/blob/master/docker-compose.yaml

FROM --platform=linux/amd64 searxng/searxng:2026.3.8-a563127a2@sha256:754a07a64e926a1fc0a8a30cd7a07d08278188f0ef6143e38ad0b22ea8599c55

# Generate default configuration files
COPY --link searxng/settings.yml /etc/searxng/settings.yml
COPY --link searxng/uwsgi.ini /etc/searxng/uwsgi.ini
COPY --link searxng/engines/woot.py /etc/searxng/engines/woot.py
COPY --link searxng/engines/woot.py /usr/local/searxng/searx/engines/woot.py

ENV SEARXNG_BASE_URL="https://search.demosjarco.dev"

# Replace the default secret_key with a securely generated one
RUN sed -i "s|secret_key: .*|secret_key: \"$(openssl rand -hex 32)\"|" /etc/searxng/settings.yml