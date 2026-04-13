# syntax=docker/dockerfile:1
# https://docs.docker.com/build/dockerfile/release-notes/

# https://github.com/searxng/searxng/blob/master/Dockerfile
# https://github.com/searxng/searxng-docker/blob/master/docker-compose.yaml

FROM --platform=linux/amd64 searxng/searxng:2026.4.13-ee66b070a@sha256:4c6b4f3e1fc10a907a40b7eaaf5b92d50f5b4097d6fb5b02041c0f9926233b36

# Generate default configuration files
COPY --link searxng/settings.yml /etc/searxng/settings.yml
COPY --link searxng/uwsgi.ini /etc/searxng/uwsgi.ini
COPY --link searxng/engines/woot.py /etc/searxng/engines/woot.py
COPY --link searxng/engines/woot.py /usr/local/searxng/searx/engines/woot.py

ENV SEARXNG_BASE_URL="https://search.demosjarco.dev"

# Replace the default secret_key with a securely generated one
RUN sed -i "s|secret_key: .*|secret_key: \"$(openssl rand -hex 32)\"|" /etc/searxng/settings.yml