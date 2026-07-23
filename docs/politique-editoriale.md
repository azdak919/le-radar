# Politique éditoriale de LE-RADAR.ca

Cette politique décrit le fonctionnement de l'agrégateur. Elle vise la
transparence envers les médias sources, les personnes autrices et le public.

## Mission et périmètre

LE-RADAR.ca facilite la découverte des médias étudiants des cégeps et
universités du Québec. Le service rassemble des titres, de courts extraits,
des métadonnées et des flux radio publiquement accessibles, puis renvoie vers
les publications et stations d'origine.

LE-RADAR.ca n'est pas la rédaction des médias répertoriés et ne modifie pas
leur position éditoriale. La publication source demeure la référence pour le
texte complet, les corrections et le contexte.

Une source est admissible lorsqu'elle est principalement produite par ou pour
une communauté étudiante québécoise, qu'elle publie du contenu journalistique
ou radiophonique identifiable et que ses données sont publiquement accessibles.
Les portails promotionnels institutionnels ne sont pas assimilés à des médias
étudiants indépendants.

## Traitement automatisé

Les robots peuvent :

- découvrir et vérifier des flux RSS, pages publiques et flux audio;
- reprendre un titre, un nom d'auteur, une date et un court extrait;
- déterminer une image vedette et son crédit à partir de la page source;
- utiliser une image sous licence ouverte lorsque la source n'offre aucune
  image exploitable;
- colliger les horaires et métadonnées « à l'antenne » des radios.

Ces opérations sont heuristiques. Une donnée automatisée peut être incomplète
ou erronée même lorsque les contrôles techniques passent.

## Images et crédits

L'ordre de préférence est :

1. image de l'article avec le crédit fourni par la source;
2. image sous licence ouverte avec créateur, licence et lien de provenance;
3. visuel générique clairement identifiable;
4. aucune image plutôt qu'une illustration trompeuse.

Une image de remplacement illustre un sujet; elle ne doit pas laisser entendre
qu'elle documente directement l'événement couvert. Les signalements de mauvais
appariement sont traités comme des corrections éditoriales.

## Corrections, retrait et droit de réponse

Une rédaction, une personne autrice, une personne créditée ou un membre du
public peut signaler :

- une attribution, un crédit ou un extrait incorrect;
- une image trompeuse ou utilisée dans un mauvais contexte;
- un média mal classé ou qui n'est plus étudiant;
- un lien dangereux, brisé ou redirigé vers un autre contenu;
- une demande de retrait ou de non-référencement.

Les demandes peuvent être déposées dans les
[issues du projet](https://github.com/azdak919/le-radar/issues). Il faut fournir
l'URL concernée, la correction souhaitée et, lorsqu'elle est pertinente, la
relation avec le média ou le contenu. Les informations personnelles sensibles
ne doivent pas être publiées dans une issue publique.

Les corrections factuelles claires peuvent être appliquées immédiatement. Une
demande qui nécessite de vérifier une identité, un mandat ou des droits sera
mise en attente jusqu'à cette vérification. Le retrait d'une entrée publique
n'efface pas automatiquement les anciennes révisions techniques de Git; les
demandes portant aussi sur l'historique sont évaluées séparément.

## Transparence

- Les articles renvoient vers leur URL d'origine.
- Le nom du média et, lorsque disponible, celui de l'auteur sont affichés.
- Les images externes indiquent leur crédit ou leur licence disponible.
- Les données automatisées et leur état de santé sont versionnés dans le dépôt.
- Les relations ou partenariats futurs avec des médias seront indiqués
  clairement et ne modifieront pas silencieusement l'ordre éditorial.

Cette politique pourra évoluer avec les retours des médias participants et du
public.
