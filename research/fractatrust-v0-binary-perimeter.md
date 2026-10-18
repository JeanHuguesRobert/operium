---
title: "FractaTrust v0 — Trust Perimeter binaire"
description: "État opérationnel et première spécification du domaine FractaTrust dans FractaX."
date: 2026-10-16
document_role: architecture
document_kind: working-paper
visibility: public
lifecycle_state: working
license: Apache-2.0
related:
  - docs/fracta-trust-perimeter.md
  - docs/fractanet-mesh.md
  - docs/operium-node-agent.md
---

# FractaTrust v0 — Trust Perimeter binaire

## Statut et rattachement

**FractaTrust** est un domaine à explorer dans **FractaX** (anciennement **FractaXXXXq**). En octobre 2026, la réalité opérationnelle est un modèle **binaire** : un hôte, outil ou service est **à l'intérieur** ou **à l'extérieur** du *Trust Perimeter* administré par le Principal. Aucun niveau intermédiaire ni mécanisme autonome de score de confiance n'est présumé déployé. « Dans le périmètre » n'est **ni une preuve de sécurité**, ni une autorisation générale d'agir.

Ce document formalise l'existant et les invariants désirés sans créer de nouveau protocole ou système de secrets. La documentation d'exploitation de référence reste [Fracta trust perimeter and secrets](../docs/fracta-trust-perimeter.md).

## Périmètre effectif à documenter et vérifier

| Élément | Rôle actuel | Observation / limite |
|---|---|---|
| Gmail du Principal | Sauvegarde du `.env` d'Inseme et pivot possible en déplacement | Restauration sur instruction, pas synchronisation ou distribution automatique |
| `registre-Mariani` privé | Registre privé et références opérationnelles | Un dépôt privé n'est pas en soi un coffre de secrets |
| FractaNodes | Hôtes administrés, accès SSH par identité de maillage partagée | Une même clé de maillage accroît le rayon d'impact d'une compromission |
| Tailscale | Transport privé entre nœuds | L'appartenance au tailnet n'accorde pas un mandat COP |
| `.env` Inseme (ThinkPad) | Bootstrap / variables Supabase de l'Agent John | Non stocké dans GitHub ; copies opérationnelles à inventorier, jamais publier les valeurs |
| Supabase `instance_config` | Configuration par instance, notamment paramètres secrets | Ne peut fournir les identifiants initiaux avant authentification ; accès effectif et politiques à vérifier |
| Operium | Inventaire, déploiement, procédures, traces techniques | Stocke références, emplacements et politiques, pas corps de secrets |

La qualification précise de chaque hôte/canal doit être **vérifiée** à l'usage. L'entrée dans le périmètre résulte d'une décision de l'opérateur, pas de la simple découverte réseau.

## Trois séparations non négociables

1. **Confiance ≠ identité** : Tailscale ou la possession d'une clé SSH attestent un moyen d'accès, pas la personne ni son intention.
2. **Confiance ≠ autorité** : seule la vérification d'un mandat COP valide, de sa portée et de sa version peut autoriser un effet gouverné. Le mandat Agent JHN en lecture seule n'est pas un mandat d'octroi comptable.
3. **Confiance ≠ possession des secrets** : un handler interne peut invoquer un courtier de capacités sans obtenir la clé `service_role`.

Le RLS PostgreSQL reste une protection complémentaire facultative ; il n'est pas la source de légitimité du mandat, notamment lorsque des connexions utilisent `service_role`.

## Cycle opérationnel minimal (v0)

1. **Découvrir** les besoins d'un environnement via Operium et les références `instance_config`, sans lire ni journaliser les valeurs secrètes lors de l'inventaire.
2. **Amorcer** depuis un `.env` local existant ; en mobilité, utiliser la sauvegarde Gmail comme récupération contrôlée lorsque nécessaire.
3. **Limiter** les données distribuées à l'hôte ou au service de confiance ayant un besoin effectif ; ne pas recopier automatiquement un `.env` complet.
4. **Vérifier** la configuration (présence, version, cohérence, permissions de fichiers) sans divulguer les secrets.
5. **Tracer** l'origine, la destination, la décision, la date, l'empreinte non réversible de l'artefact si utile et la raison de l'opération — jamais sa valeur.
6. **Révoquer et renouveler** après sortie du périmètre ou compromission suspectée ; l'identité SSH commune aux FractaNodes réclame une procédure de rotation groupée.

## FractaTrust futur — non encore réalisé

Hypothèses de recherche : attestations portables, jugement contextuel, composition non automatiquement transitive, contrôle par capacité et séparation des preuves d'autorité et de confiance. **Aucune de ces notions n'introduit aujourd'hui un second niveau de confiance**. Des évolutions devront être vérifiées par Reality Tests avant d'être déclarées effectives.

## Premier Reality Test

En déplacement sans ThinkPad : retrouver la **référence** de la sauvegarde Gmail, confirmer son actualité **sans ouvrir ses secrets en sortie publique**, choisir un FractaNode interne autorisé, vérifier sa joignabilité Tailscale/SSH, et effectuer un contrôle de présence des variables Supabase nécessaires sans copie ni diffusion de leurs valeurs. Les secrets ne peuvent être restaurés que sur une destination identifiée et autorisée. Enregistrer la trace sans secret.

## À ne pas confondre

- FractaTrust : *périmètre de confiance et évaluation future*.
- COP : *mandats et autorité d'agir*.
- FractaJudgement : *jugements motivés*.
- FractaRouting : *acheminement et sélection de capacités*.
- Operium : *mémoire opérationnelle et gestion des nœuds*.
- `instance_config` : *données de configuration*, pas une délégation de privilèges.
