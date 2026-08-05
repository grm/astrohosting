# Astrohosting

[![Build and publish Docker image](https://github.com/grm/astrohosting/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/grm/astrohosting/actions/workflows/docker-publish.yml)

Page web statique (aucun backend) pour suivre plusieurs sites d'observation
astro : prévisions météo détaillées, carte des nuages animée, seeing /
transparence atmosphérique, et caméra en direct par site.

## Fonctionnement

Tout tourne côté navigateur, aucun serveur n'est nécessaire :

- **`public/sites.yaml`** liste les emplacements suivis (voir format ci-dessous).
  Il est chargé et parsé directement en JavaScript via [js-yaml](https://github.com/nodeca/js-yaml) (CDN).
- **Prévisions détaillées** (nuages par altitude, humidité, vent, température,
  probabilité de précipitation) : appel direct à l'API [Open-Meteo](https://open-meteo.com)
  (gratuite, sans clé, CORS activé).
- **Seeing / transparence atmosphérique** : graphique officiel du produit
  [7Timer! ASTRO](https://www.7timer.info/doc.php), affiché comme simple image
  (pas de souci CORS puisqu'il s'agit d'une balise `<img>`).
- **Carte des nuages animée** : widget embarqué [Windy.com](https://www.windy.com).
- **Caméra en direct** : rendue selon le `type` défini par site dans `sites.yaml`
  (`image`, `iframe` ou `hls`). Un site peut définir plusieurs caméras
  (`cameras: [...]`), affichées sous forme d'onglets à cliquer.

## Lancer en local

Comme le fichier `sites.yaml` est chargé via `fetch()`, il faut servir le
dossier `public/` par un petit serveur HTTP (ouvrir `index.html` directement
avec `file://` ne fonctionnera pas à cause des restrictions CORS des navigateurs
sur les fichiers locaux).

```bash
cd public
python3 -m http.server 8000
```

Puis ouvrir http://localhost:8000 dans le navigateur.

## Déployer

Le projet est 100% statique : il suffit de publier le contenu du dossier
`public/` sur n'importe quel hébergeur statique, par exemple :

- **GitHub Pages** : configurer Pages sur le dossier `public/` (ou `/docs` en
  renommant le dossier), aucune étape de build nécessaire.
- **Netlify / Vercel** : créer un site avec `public/` comme "publish directory",
  aucune commande de build nécessaire.
- **Docker (auto-hébergement)** : voir ci-dessous.

### Docker (auto-hébergement sur ton propre serveur)

Une image Docker (Nginx + fichiers statiques) est automatiquement construite
et publiée par GitHub Actions dans le registre de conteneurs du dépôt
(GitHub Container Registry) à chaque push sur `main` — voir
`.github/workflows/docker-publish.yml`.

**Démarrer le conteneur à partir de l'image publiée :**

```bash
docker run -d --name astrohosting -p 8080:80 --restart unless-stopped \
  ghcr.io/grm/astrohosting:latest
```

Le site est alors accessible sur http://ton-serveur:8080.

Pour utiliser ta propre configuration (`sites.yaml`) sans reconstruire
l'image, monte ton fichier en volume :

```bash
docker run -d --name astrohosting -p 8080:80 --restart unless-stopped \
  -v $(pwd)/sites.yaml:/usr/share/nginx/html/sites.yaml:ro \
  ghcr.io/grm/astrohosting:latest
```

**Ou avec Docker Compose** (construit l'image en local plutôt que de
récupérer celle publiée, pratique en développement) :

```bash
docker compose up -d --build
```

`sites.yaml` est alors monté en volume (lecture seule) : tu peux éditer
`public/sites.yaml` directement sur le serveur et simplement rafraîchir la
page dans le navigateur, sans reconstruire l'image.

**Pourquoi c'est utile ici en particulier** : certaines caméras all-sky
publiques (comme celle de Trevinca, ou la caméra "Astrosurf" d'Oukaïmeden) ne
sont exposées qu'en HTTP, pas HTTPS.
Si le site est servi en HTTPS (GitHub Pages, Netlify...), le navigateur
bloque le chargement de ces images en "contenu mixte". En auto-hébergeant le
site en HTTP sur ton propre serveur, ce problème disparaît : une page HTTP
peut charger n'importe quelle ressource (HTTP ou HTTPS) sans restriction.

Si tu veux exposer le site sur Internet en HTTPS (recommandé si accessible
publiquement, ex: via un reverse proxy Traefik/Caddy/Nginx avec
Let's Encrypt), sache que ça réintroduira le blocage des caméras en HTTP
pur — c'est un compromis à arbitrer selon ton usage (réseau local vs.
exposition publique).

## Configurer les sites (`public/sites.yaml`)

```yaml
sites:
  - id: mon-site               # identifiant unique (slug)
    name: "Nom affiché"
    lat: 43.7519                # latitude en degrés décimaux
    lon: 6.9219                 # longitude en degrés décimaux
    elevation_m: 1270           # altitude en mètres (optionnel)
    timezone: "Europe/Paris"    # fuseau horaire IANA (optionnel, informatif)
    notes: >
      Description libre affichée dans l'interface.
    camera:                      # une seule caméra pour ce site
      type: image               # "image", "iframe" ou "hls"
      url: "https://.../snapshot.jpg"
      refresh_seconds: 60        # (type "image" uniquement) intervalle de rafraîchissement
```

Pour afficher **plusieurs caméras** sur un même site (sélectionnables via des
onglets), utilise `cameras` (liste) à la place de `camera` :

```yaml
    cameras:
      - name: "Allsky nord"       # nom affiché dans l'onglet
        type: image
        url: "https://.../cam1.jpg"
        refresh_seconds: 60
      - name: "Allsky sud"
        type: image
        url: "https://.../cam2.jpg"
        refresh_seconds: 60
```

Types de caméra supportés :

| `type`   | Usage                                                                 |
| -------- | ---------------------------------------------------------------------|
| `image`  | URL d'une image (snapshot JPEG/PNG), rafraîchie automatiquement       |
| `iframe` | URL d'une page web externe (ex: page publique d'une webcam), embarquée en `<iframe>` |
| `hls`    | URL d'un flux vidéo live `.m3u8` (HLS), lu via `hls.js`                |

Les 3 sites présents par défaut ont des coordonnées réelles : `Oukaïmeden`
(Maroc, 2 caméras allsky publiques) et `Trevinca` (Espagne, 1 caméra allsky
publique) ont de vraies URLs de caméra ; `Orgeval` (France) a une URL
factice (`example.com`) à remplacer par la tienne.

## Notes

- Open-Meteo et Windy sont utilisés dans le respect de leurs conditions
  d'utilisation gratuite (usage non commercial / raisonnable).
- 7Timer! est un service gratuit sans clé API, maintenu par le Shanghai
  Astronomical Observatory ; merci de ne pas l'utiliser à des fins commerciales.
