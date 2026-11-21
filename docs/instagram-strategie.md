# Instagram — choix sourcés

Document de décision pour le propriétaire. Rien ici n’est une consigne inventée : chaque recommandation renvoie à une page lue. Les textes des publications restent les titres, les médias, les auteurs et les crédits déjà validés. Aucun slogan n’est ajouté. Aucun abonnement automatique, aucune demande d’engagement (« like », « tague un ami »), aucun dépassement de mots-clics.

La publication du dimanche 22 novembre 2026, vers 19 h 30 (heure de Montréal), part avec l’image 3:4 unique déjà dessinée (variante « couverture »). Le carrousel et le choix entre les trois variantes attendent un oui.

## Format : image seule ou carrousel

**Recommandation.** Proposer un carrousel de La une : la première diapo est la couverture (titre de la une, photo, média, crédit), puis une diapo par article retenu, puis une dernière diapo qui ne porte que `le-radar.ca`. Ne pas l’activer avant le choix du propriétaire. Dimanche : une seule image.

**Pourquoi, d’après les études lues.**

- Buffer, analyse de plus de 4 millions de publications envoyées par Buffer de janvier 2022 à octobre 2024 : les carrousels ont 2,14 fois l’engagement des images seules (likes, enregistrements, commentaires, partages, selon la définition d’Instagram reprise par Buffer) et 12 % de plus que les Reels. Les Reels ont davantage de portée. [Data Shows Instagram Reels are Best For Reach — But Not Engagement](https://buffer.com/resources/instagram-reach-engagement-analysis/) (23 octobre 2024). Buffer y cite Adam Mosseri : publier plusieurs photos « rend l’expérience plus riche » et « donne à la publication plusieurs occasions d’apparaître dans le fil ».
- Later, analyse de publications de fil (échantillon annoncé : plus de 44 millions de janvier 2021 à février 2022, puis un second lot) : le carrousel a le taux d’engagement moyen le plus élevé des formats de fil, devant l’image seule. [Best Instagram Posts Types](https://later.com/blog/best-types-of-instagram-posts/) (8 avril 2022). L’étude est antérieure aux Reels tels qu’ils dominent le classement aujourd’hui ; elle ne dit pas qu’un carrousel bat un Reel en portée.
- Socialinsider, repères 2025 sur 67,5 millions de publications de comptes de marques : taux d’engagement par abonné de 0,55 % pour le carrousel, 0,52 % pour les Reels, 0,37 % pour l’image. [2026 Instagram Organic Benchmarks](https://www.socialinsider.io/social-media-benchmarks/instagram).
- Metricool, étude 2024 (391 490 comptes professionnels, 1 848 495 carrousels de fil) : taux d’engagement de 10,15 % pour le carrousel, 7,36 % pour l’image. [Metricool Instagram Study 2024, PDF](https://enhance.agency/wp-content/uploads/Enhance_Metricool_Study-2024.pdf).

Aucune de ces études ne porte sur les médias étudiants du Québec. Elles comparent des formats, pas notre audience. La recommandation est donc : le carrousel est le meilleur candidat **pour l’engagement** d’une une qui a déjà plusieurs articles réels ; il n’est pas présenté comme un gain de portée garanti. Les Reels restent hors sujet : pas de story, pas de reel (décision déjà en dépôt).

**Ce que Buffer permet.** Oui, un carrousel Instagram passe par l’API.

- Le guide Buffer « Using Instagram with Buffer », mis à jour le 12 novembre 2026 : publication automatique d’une image, d’un carrousel, d’une vidéo, d’un reel ou d’une story si le compte est Professionnel (Créateur ou Entreprise). Carrousel : jusqu’à 20 images et vidéos, ratio entre 3:4 et 1,91:1, 8 Mo par image. [Using Instagram with Buffer](https://support.buffer.com/articles/using-instagram-with-buffer-YSjg2dXFV8).
- Le même éditeur, article sur les pièces jointes : le fil Instagram accepte jusqu’à 20 images dans le compositeur **et dans l’API**. Au-delà, l’API refuse tout de suite (« Instagram carousels cannot have more than 20 images »). [Attaching images, videos, and other media](https://support.buffer.com/articles/attaching-images-videos-and-other-media-to-your-posts-eudySt0TnS).
- L’API GraphQL `createPost` prend `assets`, une liste **ordonnée** d’images hébergées en HTTPS public et stable jusqu’à l’heure d’envoi. [CreatePostInput](https://developers.buffer.com/types/CreatePostInput.html), [Hosting Media](https://developers.buffer.com/guides/hosting-media.html), [Create an image post](https://developers.buffer.com/examples/create-image-post.html).

Le code actuel n’envoie qu’une image (`assets` d’un seul élément dans `scripts/social/channels/x-buffer.mjs`). Étendre à plusieurs URLs est le même appel, pas un autre produit. Le CSV d’import en masse de Buffer, lui, n’accepte pas les carrousels : [How to upload posts in bulk](https://support.buffer.com/articles/how-to-upload-posts-in-bulk-to-buffer-cTIhl4mv6H). Nous n’utilisons pas ce CSV.

**Ordre proposé, si le carrousel est retenu.** Diapo 1 = couverture (c’est elle qui reste dans la grille du profil). Diapos suivantes = un article chacune (titre, média, auteur, crédit). Dernière diapo = le texte `le-radar.ca`, sans phrase publicitaire. Plafond pratique : 4 articles + la diapo finale, donc 5 images, bien sous les 20.

**Écart à connaître.** La référence développeur Meta pour `POST /{ig-user-id}/media` écrit encore qu’une image doit être entre 4:5 et 1,91:1, JPEG, sRGB, 8 Mo, largeur 320 à 1440 px, et que `alt_text` va jusqu’à 1 000 caractères. [IG User Media](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/). Le centre d’aide Instagram, lui, accepte un ratio jusqu’à 3:4 (1 080 px de large, hauteur jusqu’à 1 440). [Image resolution of photos you share on Instagram](https://www.facebook.com/help/1631821640426723). Buffer, le 12 novembre 2026, aligne sa doc Instagram sur 3:4. C’est cette doc que nous suivons, parce que l’envoi passe par Buffer, pas par l’API Graph directe. Si un envoi 3:4 était refusé, le repli serait de **redessiner** en 4:5, pas de recadrer le portrait des autres réseaux.

## Grille du profil, lisibilité, identité

Le centre d’aide dit qu’une photo hors ratio supporté est recadrée. Une 3:4 à 1 080×1 440 entre dans la fourchette (hauteur 1 440 pour 1 080 de large). [Image resolution](https://www.facebook.com/help/1631821640426723).

La grille du profil montre surtout le carré central. Sur une image 1 080×1 440, ce carré laisse 180 px en haut et 180 px en bas hors du carré. Le logo, le titre, le média et le crédit sont donc placés dans cette bande centrale. La date et le libellé « La une du matin / du soir » occupent les bandes qui peuvent sortir du carré : elles restent lisibles sur la publication ouverte.

Lisibilité téléphone : gros titre (Source Serif 4, la police du kit), peu de mots sur l’image (le titre réel, le nom du média, le crédit). Le détail (autres articles, liens) reste dans la légende, pas empilé sur la photo.

Identité, inchangée : logo du Radar sur fond noir, `LE-RADAR.ca` en Source Serif 4, crédit commençant par 📸. Trois variantes de la **même** une du soir sont dans la PR pour choisir la répartition photo / titre. Aucune n’ajoute un slogan.

| Variante | Ce qui change | Fichier |
| --- | --- | --- |
| Couverture (défaut, dimanche) | Photo haute, titre en dessous sur le noir. Le titre reste à 68 px quand il tient : un écart de mesure de quelques pixels le rabattait à 48. | `variante-couverture.jpg` |
| Titre | Photo plus courte, titre plus grand | `variante-titre.jpg` |
| Affiche | Titre posé sur le bas de la photo, fond noir opaque | `variante-affiche.jpg` |

Aucun générateur externe n’a été ajouté. Des outils souvent cités pour fabriquer des images sociales sont sous Apache-2.0, incompatible avec la GPL-2.0-only du dépôt. Le rendu reste `affiches/social-une.js` et `affiches/social-une.css`, déjà dans le projet.

## Accroche, enregistrements, partages

Le classement du fil, expliqué par Instagram le 31 mai 2023, s’appuie d’abord sur l’activité de la personne (publications aimées, partagées, enregistrées, commentées) et sur la popularité de la publication, dont la vitesse des likes, commentaires, partages et enregistrements. [Instagram Ranking Explained](https://about.instagram.com/blog/announcements/instagram-ranking-explained).

Le centre Créateurs répète que la distribution recommandée dépend de l’engagement par spectateur, dont le partage. [FAQ Créateurs](https://creators.instagram.com/faq). Les signaux cités pour les recommandations incluent likes, commentaires, partages et enregistrements. [Recommendations on Instagram](https://creators.instagram.com/blog/instagram-recommendations-eligibility-tips-creators).

Conséquence pour nous, sans phrase d’appât : la première ligne de la légende reste l’accroche déjà en place (« La une du matin / du soir »), assez courte pour être lue avant « plus ». Le moyen d’obtenir des enregistrements est le contenu utile (la liste réelle des articles, surtout en carrousel), pas une consigne « enregistre ce post ». L’appel déjà validé reste « lien en bio » et le texte `le-radar.ca`. Depuis le 30 avril 2026, Instagram étend aux photos et aux carrousels l’exclusion des comptes qui republient surtout le travail des autres. [Rewarding original creators](https://creators.instagram.com/blog/rewarding-original-creators-on-instagram). Nos images sont composées par le Radar à partir des titres et des photos créditées ; la légende ne recopie pas l’article.

## Mots-clics

Le code plafonne déjà à 5, en fin de légende, choisis dans le titre et le média (établissement, `#MédiasÉtudiants`, `#Québec`). On ne les met pas en premier commentaire.

- Later écrit que le compte `@creators` d’Instagram recommande 3 à 5 mots-clics. La même page publie une analyse de 18,1 millions de publications de fil via Later où 20 à 30 mots-clics correlaient avec davantage de portée. [How Many Hashtags Should You Use on Instagram?](https://later.com/blog/how-many-hashtags-on-instagram/) (mise à jour du 4 juin 2025). Cette corrélation ne peut plus être suivie si le produit n’en accepte plus que cinq.
- L’expérience Hootsuite (20 publications, un compte mariage, 3 à 5 mots-clics contre 30) a mesuré une portée moyenne un peu plus haute avec 3 à 5. L’auteur dit lui-même que l’échantillon est petit et spécifique. [How Many Instagram Hashtags Should You REALLY Use?](https://blog.hootsuite.com/experiment-instagram-hashtags/).
- Hootsuite recommande par ailleurs 3 à 5 mots-clics pertinents, dans la légende, sans liste générique. [Instagram hashtags for 2025](https://blog.hootsuite.com/instagram-hashtags/).

Nous suivons le plafond déjà codé (5) et le conseil 3 à 5 d’Instagram rapporté par Later, pas l’ancienne corrélation « plus il y en a, plus ça porte ». Pas de `#explore`, pas de liste collée.

## Comptes à mentionner

Seulement un compte déjà écrit dans `social-feed.json`, et seulement si l’article vient de ce média. Une mention au plus, comme sur X. Pas d’abonnement automatique (`automation.instagram_follow` est false).

Ces URL sont celles que le site publie déjà. Elles n’ont pas été revérifiées une par une dans l’application Instagram pour cette note.

| Média | URL |
| --- | --- |
| Quartier Libre | https://www.instagram.com/quartierlibre.ca/ |
| Montréal Campus | https://www.instagram.com/montrealcampus/ |
| The McGill Daily | https://www.instagram.com/mcgilldaily/ |
| The Link | https://www.instagram.com/linknewspaper/ |
| Zone Campus | https://www.instagram.com/zonecampus/ |
| Le Collectif | https://www.instagram.com/jlecollectif/ |
| Exil | https://instagram.com/exilexcvm/ |
| Le Polyscope | https://www.instagram.com/polyscope_aep/ |
| The Campus | https://www.instagram.com/thebishopscampus/ |
| The Plant | https://www.instagram.com/theplantdawson/ |
| L'Oisif | https://www.instagram.com/cegepchicoutimi/ |
| Impact Campus | https://www.instagram.com/impact_campus_ul/ |
| CHYZ 94,3 | https://www.instagram.com/chyz943/ |
| CISM 89,3 | https://www.instagram.com/cism893/ |
| CKUT 90,3 | https://www.instagram.com/radiockut/ |
| CJLO 1690 AM | https://www.instagram.com/cjlo1690am/ |
| CFAK 88,3 | https://www.instagram.com/cfak883/ |
| CHOQ.ca | https://www.instagram.com/choq.ca/ |

## Texte alternatif

Instagram permet de remplacer la description automatique, lue seulement par un lecteur d’écran. [Edit the alternative text](https://help.instagram.com/503708446705527). L’API professionnelle accepte `alt_text` jusqu’à 1 000 caractères sur une image ou une image de carrousel, pas sur un reel ni une story. [IG User Media](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/).

Le texte alternatif reste factuel : titre, média, crédit. S’il invente un nom ou un chiffre absent des faits, le repli déterministe part. Workers AI ne rédige pas la légende.

## Heures et cadence

Il n’existe pas, dans les pages lues, une étude du public étudiant québécois de 17 à 25 ans. On ne transporte pas un horaire américain comme s’il était mesuré à Montréal.

Sprout Social, données du 27 novembre 2025 au 27 février 2026, heures **locales** de l’audience, secteur écoles et éducation : meilleurs jours mardi et mercredi, créneau cité à 11 h ; la page donne aussi mardi 15 h–17 h et 19 h–21 h, mercredi jusqu’à 21 h. Les fins de semaine y sont les plus faibles pour ce secteur. [Best Times to Post on Instagram in 2026](https://sproutsocial.com/insights/best-times-to-post-on-instagram/) (31 mars 2026).

Nos deux rendez-vous déjà décidés, 7 h 45 et 19 h 30 heure de Montréal, tombent l’un avant les cours, l’autre dans la plage du soir citée pour l’éducation. On les garde. Le dimanche 22 novembre est le jour 1 de la montée déjà écrite dans `data/social/policy.json` (départ le 22 novembre, une une du soir la première semaine). Ce n’est pas « le meilleur jour » selon Sprout ; c’est le calendrier de rodage. Instagram dit par ailleurs que la recommandation s’élargit quand les premières personnes réagissent, et que le contenu original est favorisé. [Helping creators of all sizes break through](https://creators.instagram.com/blog/helping-creators-of-all-sizes-break-through) (26 février 2025), [Rewarding original creators](https://creators.instagram.com/blog/rewarding-original-creators-on-instagram) (30 avril 2026). La montée lente (1, puis 2, puis les résultats sportifs après le 14e jour) limite le volume au démarrage. Elle n’est pas une tactique d’engagement artificiel.

## Ce qui reste interdit

Pas de reel, pas de story, pas de premier commentaire, pas d’abonnement automatique, pas de republication de la présentation du 21 novembre 2026, pas de mot-clic au-delà de cinq, pas de mention d’un compte absent de la liste ci-dessus.
