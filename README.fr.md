# NarrowbandStarless

**Un script PixInsight qui applique le même pipeline linéaire à chaque master bande étroite.**
Choisis tes images SII, Ha et OIII, coche les outils, clique *Exécuter* : chaque canal passe par le
retrait de gradient GraXpert, BlurXTerminator, StarXTerminator et NoiseXTerminator, l'un après
l'autre, avec les mêmes réglages. Les images sources ne sont jamais modifiées.

*English version: [README.md](README.md)*

Conçu pour la chaîne de traitement de l'auteur (masters issus de CommonCrop, puis ce script, puis
la combinaison SHO). Partagé tel quel.

## Ce qu'il fait

Pour chaque canal coché, sur une copie de l'image choisie :

1. **GraXpert** : retrait de gradient par IA. *Replace image* est toujours activé dans le pipeline,
   pour que les étapes suivantes travaillent sur l'image corrigée.
2. **BlurXTerminator** : déconvolution.
3. **StarXTerminator** : retrait des étoiles (avec, en option, une image séparée des étoiles).
4. **NoiseXTerminator** : réduction du bruit.
5. **Auto STF** (optionnel, activé par défaut) : une STF automatique liée sur chaque résultat et
   chaque modèle de fond, pour que les images s'ouvrent prêtes à examiner. Affichage seulement : les
   pixels ne sont pas modifiés. Les images d'étoiles ne sont pas concernées (RC Astro déconseille
   de les étirer automatiquement).

Chaque outil est lancé seul (pas de ProcessContainer), avec la durée de chaque étape dans la console
et *Pause/Abort* pris en compte entre deux étapes. Les résultats s'appellent `Starless_SII`,
`Starless_Ha` et `Starless_OIII` par défaut (modifiables). Les fenêtres annexes s'appellent
`Background_<canal>` (GraXpert *Show background*) et `Stars_<canal>` (StarXTerminator *Generate Star
Image*). Les copies gardent les mots-clés FITS et la solution astrométrique de leur source.

## Prérequis

| Élément | Version |
|---|---|
| PixInsight | 1.9.4 et suivants (moteur JavaScript V8) |
| Process GraXpert (DeepSkyForge) et application GraXpert | le process exige GraXpert 4.0.0 ou plus récent |
| BlurXTerminator, StarXTerminator, NoiseXTerminator | RC Astro, licences à part |

Seuls les outils activés doivent être installés.

## Installation

### Par le dépôt de mises à jour PixInsight (recommandé)

1. *Resources > Updates > Manage Repositories*, ajouter
   `https://jps-34.github.io/NarrowbandStarless/`
2. *Resources > Updates > Check for Updates*, puis redémarrer PixInsight.
3. Le script apparaît dans *Script > Utilities > NarrowbandStarless*.

Tant que le dépôt n'est pas signé, PixInsight ne l'accepte qu'avec l'option de sécurité *Allow
unsigned update repositories* activée.

### Manuelle

Télécharger `scripts/NarrowbandStarless.js`, puis le lancer par *Script > Execute Script File*, ou
ajouter son dossier par *Script > Feature Scripts > Add* pour l'avoir dans *Script > Utilities*.

## Prise en main

1. Ouvrir les trois **masters linéaires avec étoiles** (par exemple `SII_crop`, `Ha_crop`,
   `OIII_crop`). Le script présélectionne les images dont le nom contient SII, Ha ou OIII.
2. Vérifier l'image de chaque canal dans le groupe *Images* ; décocher un canal pour l'ignorer.
3. Cocher les outils à lancer. Garder *Travailler sur une copie* pour laisser les sources intactes.
4. *Exécuter*. L'avancement et les durées s'affichent dans la Process Console.

Les réglages sont mémorisés d'une session à l'autre. *Réinitialiser* remet les valeurs par défaut en
gardant les images choisies. Glisser le triangle *New Instance* sur le bureau enregistre tous les
réglages et les noms d'images dans une icône de process ; un double-clic sur l'icône rouvre le
dialogue avec ces réglages.

## Réglages

L'interface est en anglais ou en français (menu *Langue / Language*). **Les réglages des outils
gardent les noms utilisés par les outils eux-mêmes**, dans les deux langues, pour s'y retrouver un
pour un.

Le *Mode avancé* affiche :

| Outil | Réglages |
|---|---|
| GraXpert | Smoothing, Correction (Subtraction / Division), Show background, Disable GPU acceleration |
| BlurXTerminator | Correct Only, Sharpen Stars, Adjust Star Halos, Automatic PSF, PSF Diameter, Sharpen Nonstellar |
| StarXTerminator | Generate Star Image, Unscreen Stars |
| Auto STF | Shadows clipping (-2.80 par défaut, en MAD normalisées), Target background (0.25 par défaut) |
| NoiseXTerminator | Intensity/color separation, Frequency separation, puis uniquement les réglages utilisés par ce mode (Denoise ; Denoise HF / LF ; Denoise HF / LF intensity et color), Frequency scale, Detail, Iterations |

Remarques :

* GraXpert *Smoothing* : la documentation du process GraXpert recommande 0.0 dans la plupart des cas
  (il ne fait que flouter le modèle de fond). La valeur par défaut est ici 0.2, le réglage de
  l'auteur.
* NoiseXTerminator *Intensity/color separation* ne fonctionne que sur une image couleur
  (documentation RC Astro). Désactivé par défaut, car les masters SII, Ha et OIII sont
  monochromes.
* StarXTerminator *Unscreen Stars* est prévu pour les images étirées ; RC Astro déconseille de
  l'utiliser sur des données linéaires.

## Problème connu : process GraXpert sous Linux

Avec GraXpert 4.0.0 et le build du process GraXpert du 17/10/2026, sous Linux, GraXpert écrit
`<nom>_GraXpert.xisf` alors que le process cherche `<nom>_graXpert.xisf`. Les noms de fichiers
Linux tiennent compte de la casse : le résultat n'est jamais chargé et l'image revient inchangée,
alors que la console annonce un succès. Windows et macOS ne sont pas concernés.

En attendant un process corrigé, un petit lanceur peut renommer la sortie. Faire pointer le process
GraXpert (ou ton `PATH`) vers un script de ce type, avec ton propre chemin vers l'exécutable
GraXpert :

```sh
#!/bin/sh
<chemin-vers-l-executable-GraXpert> "$@"
rc=$?
case "$1" in
  */Pix[0-9]*.*)
    base="${1%.*}"
    for f in "$base"_GraXpert*; do
      [ -e "$f" ] || continue
      mv -f -- "$f" "$(printf '%s' "$f" | sed 's/_GraXpert/_graXpert/')"
    done
    ;;
esac
exit $rc
```

À retirer dès qu'un process corrigé sort, sinon il casserait à nouveau le process.

## Licence

Copyright (c) 2026 Jacques Pouyaud. Publié sous [licence MIT](LICENSE).

## Crédits

*Code écrit par Claude (Anthropic), sous la direction de Jacques Pouyaud, qui a défini le besoin,
l'a testé sur ses propres données et en a validé les résultats.*
