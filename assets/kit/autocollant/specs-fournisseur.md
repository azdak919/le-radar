# Autocollants LE-RADAR.ca — fiche technique pour fournisseurs

## Format
- Autocollant carré, ratio 1:1, **3 × 3 po (76,2 × 76,2 mm)** après coupe.
- Coins arrondis, **rayon d'environ 3 mm** (tracé de coupe fourni).
- Fond perdu (bleed) : **1/8 po (3 mm)** de chaque côté, donc fichier de **82,2 × 82,2 mm** (3,236 × 3,236 po).
- Marge de sécurité : tout le texte et le code QR sont à **au moins 3 mm à l'intérieur de la coupe**.
- Le fichier est vectoriel et se met à l'échelle, mais le code QR (tuile de 20,5 mm) et les langues (environ 5 pt) ne doivent pas être réduits : garder 3 po (76,2 mm) ou plus.

## Contenu graphique
- Fond noir, texte en blanc, logo (satellite) dans ses couleurs d'origine : gris, bleu-gris et orange.
- Logo : `icon.svg` du site https://le-radar.ca (vectoriel), tel quel, sans retouche.
- « LE-RADAR.ca » en **Source Serif 4 Display Bold** (la police du mot-symbole officiel du site, kit `wordmark-on-dark.svg`, interlettrage −0,02 em, licence OFL), **convertie en contours** (aucune police à fournir). 
- Slogan : « Les médias étudiants du Québec » / « Québec student media » (Inter, environ 7 pt). Nom complet : « Le Réseau Académique de Découverte et d'Agrégation de Ressources » (Inter Medium, environ 6 pt).
- Langues du site, en tout petit (environ 5,2 pt) : « FR · IU · EN · ES · AR · ZH · HI · FA · PT » puis « VI · HT · BN · RO · TR · RU · UR · IT · DE » (IU = inuktitut).
- Code QR : encode `https://le-radar.ca`, correction d'erreur **niveau H (30 %)**, 29 × 29 modules, noir sur **tuile blanche à coins arrondis** avec zone de silence de 3 modules. Module imprimé : environ 0,59 mm. Ne pas inverser les couleurs du code QR (le noir sur blanc se lit beaucoup mieux).
- Lecture vérifiée sur le fichier rendu avec zxing-cpp (et OpenCV) : sur les PNG, les PDF à 300 ppp et une version réduite et floutée. À refaire avec un téléphone sur l'épreuve papier avant la grosse commande.

## Finitions à choisir
- **Matériau** : vinyle blanc adhésif (le plus courant), ou vinyle transparent déconseillé ici (le noir et le blanc perdraient en opacité). Pour l'extérieur (voiture, vélo, ordinateur, casque), demander un vinyle **cast ou polymère durable 3 à 5 ans**.
- **Surface** : *mat* = sans reflets, noir profond et élégant, mais il marque les traces de doigts ; *lustré* = couleurs plus vives (l'orange ressort), plus de reflets. Le code QR se lit bien dans les deux, mais le lustré peut refléter la lumière. Recommandation : **mat** pour l'aspect, lustré si usage extérieur sans laminage.
- **Laminage** : un laminé transparent (mat ou lustré) protège de l'eau, des UV et des rayures. Recommandé pour l'extérieur ou les objets manipulés ; inutile pour de la distribution à l'intérieur.
- **Découpe** :
  - *Die-cut* (découpe à l'emporte-pièce ou au laser, à travers le vinyle et le papier support) : un autocollant individuel, plus cher, quantités de 100 et plus.
  - *Kiss-cut* (coupe seulement le vinyle, le support reste entier) : se décolle facilement de la feuille ; peut être livré par planche. Bon choix pour la distribution à la main et les petites quantités.
  - Dans les deux cas, utiliser le tracé **CutContour**.
- **Quantités typiques** : 50, 100, 250, 500. Le prix unitaire baisse beaucoup entre 50 et 250. Demander les prix pour les quatre paliers et une épreuve numérique (proof) avant de lancer l'impression.
- **Délai et épreuve** : demander une épreuve PDF ou, mieux, un échantillon physique (surtout pour vérifier le noir et le code QR).

## Couleurs
- Fond en **noir riche** (rich black) : **C60 M40 Y40 K100** dans les PDF « normaux ». Il donne un noir plus profond et plus uni sur un grand aplat. Total d'encre : 240 %, sous la limite habituelle de 300 %.
- Variante **K100** (`_K100.pdf`) : fond noir pur C0 M0 Y0 K100, si le fournisseur refuse le noir riche ou si son rendu est trop lourd (risque de moirage ou de séchage lent). À demander explicitement : « noir riche ou K100 ? ».
- Le blanc est du **papier / vinyle blanc nu** (C0 M0 Y0 K0) : le fournisseur doit s'assurer que le blanc n'est pas surimprimé. Sur un vinyle transparent, il faudrait une sous-couche d'encre blanche, ce qui n'est pas prévu ici.
- Le code QR (modules noirs) est en **K100 seul** dans les deux variantes, pour garder les détails nets (pas de décalage des plaques).
- Logo : couleurs d'origine en RVB dans le PDF (gris #99AAB5, #CCD6DD, #66757F ; orange #FFAC33). Le fournisseur les convertit en CMJN ; vérifier que l'orange reste vif.
- Tracé de coupe : couleur d'accompagnement (spot) nommée **CutContour**, 100 % magenta, filet de 0,25 pt, non imprimable. Dans le SVG, c'est le calque/groupe `CutContour` ; dans le PDF, le tracé utilise l'espace colorimétrique Séparation « CutContour » (norme Roland/Summa/Graphtec).
- Si le fournisseur demande « Thru-cut », « Kiss » ou un autre nom de couleur d'accompagnement, le renommer dans Illustrator ou Inkscape, c'est un seul tracé.

## Liste des fichiers
Fichiers de production du modèle officiel.
- `autocollant-le-radar-3x3in-bleed.pdf` : fichier de production, vectoriel, noir riche, fond perdu 3 mm, TrimBox à 3 mm, tracé CutContour.
- `autocollant-le-radar-3x3in-bleed_K100.pdf` : même fichier avec noir pur K100.
- `autocollant-le-radar-3x3in-bleed.svg` : version vectorielle, groupes `Artwork` et `CutContour`, texte en contours.
- `autocollant-le-radar-2400.png` : PNG 2400 × 2400 (fond perdu inclus, sans tracé de coupe, environ 740 ppp).
- `autocollant-le-radar-preview.png` : aperçu 1500 × 1500 sur fond gris clair (pas pour l'impression).
- `LICENCES-et-credits.md` : licences des polices et du logo.
- Polices : aucune à fournir (tout est en contours). Raster : aucun dans les PDF et SVG, tout est vectoriel.
