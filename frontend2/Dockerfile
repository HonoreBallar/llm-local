# 1) Interface web (React) compilée en fichiers statiques
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY web/ .
RUN npm run build

# 2) Agent Python : lit les logs, analyse, interroge le LLM, sert l'interface
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY agent/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY agent/veilleur ./veilleur
COPY --from=web /web/dist ./static
RUN useradd --system --uid 10001 veilleur && mkdir -p /data && chown veilleur /data
USER veilleur
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')"
CMD ["uvicorn", "veilleur.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
