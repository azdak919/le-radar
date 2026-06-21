# RÉQ — Radios Étudiantes du Québec

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://azdak919.github.io/radios-etudiantes-qc/)
![PWA](https://img.shields.io/badge/PWA-ready-blue)
![License](https://img.shields.io/badge/license-MIT-green)

**RÉQ** est une application web progressive (PWA) **simple, belle et parfaitement optimisée mobile** qui rassemble **toutes les radios étudiantes** des cégeps et universités du Québec en un seul endroit.

**→ [Essayer RÉQ maintenant](https://azdak919.github.io/radios-etudiantes-qc/)**

> Projet non officiel et collaboratif. RÉQ n’est affilié à aucune des stations listées.

---

## ✨ Fonctionnalités

- **Interface magnifique et mobile-first** — Design glassmorphism moderne, typographie soignée et animations fluides
- **Recherche instantanée** + filtres puissants :
  - Par type (Universités / Cégeps / Tous)
  - Par région (Montréal, Québec, Estrie, Saguenay, etc.)
  - Favoris (♥)
- **Cartes claires et informatives** : nom, fréquence, institution, ville + indicateur "LIVE" quand un flux direct est disponible
- **Lecteur audio intégré** dans le modal pour les stations qui fournissent un flux HTTPS public (ex: CHYZ 94.3)
- **Modal riche** avec description, liens sociaux, site officiel et informations pratiques
- Bouton **« Radio aléatoire »**
- Favoris persistants (localStorage)
- Support **PWA complet** : installation sur mobile, icônes, offline shell, Media Session API (contrôles sur l’écran de verrouillage)
- **Très léger** : site statique, Tailwind via CDN, JavaScript vanilla pur

---

## 📸 Aperçu

Ouvre l’application sur ton téléphone ou dans un navigateur desktop :

- Grille responsive (1 à 4 colonnes)
- Recherche et filtres ultra-réactifs
- Modal qui s’ouvre parfaitement sur mobile
- Lecteur avec visualiseur d’égaliseur quand tu écoutes en direct

---

## 🚀 Démarrage rapide (local)

```bash
# Clone le repo
git clone https://github.com/azdak919/radios-etudiantes-qc.git
cd radios-etudiantes-qc

# Serveur local simple
python -m http.server 8080
# ou
npx serve .
```

Ouvre ensuite **http://localhost:8080**

L’application est prête à être déployée directement sur GitHub Pages (juste push sur `main`).

---

## 📊 Structure du projet

```
radios-etudiantes-qc/
├── index.html          # Interface complète (HTML + Tailwind config inline)
├── style.css           # Styles glass + player + responsive
├── app.js              # Toute la logique (grille, filtres, modal, lecteur audio, favoris, PWA)
├── radios.json         # ⭐ La source de vérité — liste des radios
├── manifest.json       # Configuration PWA
├── sw.js               # Service Worker (cache shell)
├── assets/             # Icônes (192/512 + SVG)
└── README.md
```

Les anciens fichiers CHYZ+ (`schedule.js`, `news.js`, `data-utils.js`) sont conservés pour l’historique mais ne sont plus utilisés.

---

## ➕ Ajouter ou mettre à jour une radio

**C’est la partie la plus importante pour contribuer !**

1. Ouvre `radios.json`
2. Ajoute ou modifie un objet dans le tableau.

### Schéma complet

```json
{
  "id": "chyz",                          // identifiant unique (minuscules, sans espaces)
  "name": "CHYZ 94.3",                   // nom court affiché sur la carte
  "fullName": "CHYZ 94.3 FM",            // nom complet
  "institution": "Université Laval",
  "city": "Québec",
  "region": "Capitale-Nationale",        // utilisé pour les filtres
  "type": "universite",                  // "universite" ou "cegep"
  "frequency": "94.3 FM",                // ou "Web"
  "website": "https://chyz.ca/",
  "stream": "https://...",               // URL directe du flux (HTTPS recommandé). null si aucun.
  "description": "Description complète...",
  "instagram": "https://www.instagram.com/xxx/",
  "facebook": "https://www.facebook.com/xxx/",
  "tags": ["musique", "sport", "local"]
}
```

**Conseils pour le flux audio :**
- Utilise un flux HTTPS public (Icecast, Shoutcast, etc.)
- Teste-le dans un `<audio>` HTML
- Si la station n’a pas de flux public simple, mets `"stream": null` et le bouton mènera vers leur site officiel.

---

## 🛠️ Stack technique

- HTML5 + CSS + Vanilla JS (ES modules)
- Tailwind CSS via CDN (pour rester 100% statique)
- Service Worker + Web App Manifest → PWA installable
- `new Audio()` + Media Session API pour la lecture en arrière-plan

Aucun build step, aucun framework lourd.

---

## 🤝 Contribuer

Les contributions sont les bienvenues !

1. Fork le projet
2. Crée une branche (`git checkout -b ajout-radio-cegep-x`)
3. Ajoute/modifie des entrées dans `radios.json`
4. Teste localement
5. Ouvre une Pull Request

Tu peux aussi :
- Signaler des liens cassés ou des infos périmées
- Proposer des améliorations d’UX / accessibilité
- Ajouter de nouvelles stations (surtout des cégeps !)

---

## 📄 Licence

MIT — voir le fichier [LICENSE](LICENSE).

---

**Merci à toutes les radios étudiantes qui font vibrer les campus du Québec !** 🎧📻

*Projet créé et maintenu par la communauté.*