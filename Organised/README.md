# Organised

Planning type **Randomly Organised** : calendrier, repas, ménage, etc. Tout tourne dans le navigateur (données en `localStorage` sur l’appareil).

## Partager un **lien** (famille, amis)

Le projet est une **app statique** (HTML/CSS/JS). Pas besoin de Node pour l’utiliser.

### Option A — Netlify Drop (très simple)

1. Zipper le dossier du projet (avec `index.html` à la racine du zip).
2. Aller sur [https://app.netlify.com/drop](https://app.netlify.com/drop) (compte gratuit).
3. Glisser le zip : Netlify déploie et te donne une **URL** du type `https://something.netlify.app`.
4. Envoie ce lien : tout le monde ouvre l’app dans le navigateur.

### Option B — GitHub Pages

1. Créer un dépôt GitHub et y pousser ce dossier.
2. **Settings → Pages** : source **Deploy from branch**, branche `main`, dossier `/ (root)`.
3. L’URL sera du type `https://<user>.github.io/<repo>/`.

### Option C — Fichiers locaux

Envoyer le dossier (ou le zip) : ouvrir **`index.html`** dans Chrome / Firefox / Safari / Edge.

---

**Données** : chaque navigateur / appareil garde **sa** copie des tâches et du planning (rien n’est envoyé sur un serveur).

**Mobile** : menu **☰** en haut à droite, listes au-dessus des formulaires sur petit écran.
