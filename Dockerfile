# Astrohosting - image statique servie par Nginx.
#
# Le site est 100% statique (HTML/CSS/JS + sites.yaml), aucun backend n'est
# nécessaire : Nginx se contente de servir les fichiers de public/.
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY public/ /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
