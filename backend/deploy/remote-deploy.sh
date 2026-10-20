#!/usr/bin/env bash
# Exécuté sur le VPS par GitHub Actions (utilisateur llm-deploy).
# Les nouveaux fichiers ont été copiés dans /opt/llm-local/incoming ; on bascule, on vérifie, sinon on revient en arrière.
set -euo pipefail

ROOT=/opt/llm-local
APP=$ROOT/app
PREV=$ROOT/app.prev
INCOMING=$ROOT/incoming
ENV_FILE=$ROOT/shared/.env

[ -f "$ENV_FILE" ] || { echo "ERREUR : $ENV_FILE absent (à créer une fois à la main)"; exit 1; }
set -a; . "$ENV_FILE"; set +a
HEALTH_URL="https://${PUBLIC_IP}:${PUBLIC_PORT:-8443}/health/liveliness"

compose() {
  docker compose -p llm-local -f "$1/docker-compose.yml" -f "$1/docker-compose.prod.yml" --env-file "$ENV_FILE" "${@:2}"
}

healthy() {
  for _ in $(seq 1 40); do
    if curl -fsk --max-time 5 "$HEALTH_URL" >/dev/null; then return 0; fi
    sleep 5
  done
  return 1
}

echo "==> Validation de la configuration"
compose "$INCOMING" config --quiet

echo "==> Bascule vers la nouvelle version"
rm -rf "$PREV"
[ -d "$APP" ] && mv "$APP" "$PREV"
mv "$INCOMING" "$APP"

compose "$APP" pull --quiet --ignore-buildable
compose "$APP" up -d --remove-orphans

echo "==> Vérification de santé : $HEALTH_URL"
if healthy; then
  echo "OK : déploiement réussi"
  compose "$APP" ps
  exit 0
fi

echo "ÉCHEC : retour à la version précédente"
compose "$APP" logs --tail 50 || true
if [ -d "$PREV" ]; then
  rm -rf "$APP.failed"; mv "$APP" "$APP.failed"; mv "$PREV" "$APP"
  compose "$APP" up -d --remove-orphans
fi
exit 1
