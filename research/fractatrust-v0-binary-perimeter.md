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

## Hypothèse de confiance v0 et seuil d'évolution (1er novembre 2026)

Le **Trust Perimeter** constitue aujourd'hui une hypothèse de travail simple : les agents et services admis dans le périmètre du Principal sont réputés coopératifs et de bonne foi pour l'exécution de leurs mandats. Cela autorise la coopération directe sans multiplier des systèmes d'habilitation, d'évaluation, de suspicion ou de notation propres à chaque transport, service ou agent. Ce postulat opérationnel ne prétend pas démontrer leur intégrité absolue.

**Autorité unique : COP.** L'appartenance au périmètre ne vaut pas mandat universel ; les actes gouvernés sont autorisés par COP selon le mandat, le contexte et la portée de l'action. Les vérifications de transport et les permissions Unix sont des moyens techniques d'exécution ou de protection de l'intégrité du système, et ne doivent pas devenir des autorités concurrentes ou des catalogues de commandes autorisées. Les opérations `normal` et `super` utilisent la même doctrine de mandat ; dans un script `super`, `sudo` reste explicite pour éviter l'élévation accidentelle.

**Compromission : chantier différé.** L'identification d'un agent compromis, son isolement et sa réintégration devront pouvoir être étudiés à partir d'incidents, de traces contradictoires ou de tests du réel justifiant une telle évolution. À ce stade, aucun score de réputation, surveillance générale, isolement systématique ou segmentation supplémentaire n'est réputé nécessaire par principe. L'absence d'incident constaté n'est cependant pas une preuve d'invulnérabilité : une faiblesse concrète, démontrée et grave peut justifier une correction avant sa première exploitation.

**Règle de proportionnalité.** Pour toute protection nouvelle, documenter sa menace concrète, son bénéfice attendu, son coût d'exploitation et le coût d'empêchement qu'elle introduit. Préférer la capacité d'observer, de corriger et de révoquer à l'accumulation préventive de barrières. Éviter que FractaTrust ne devienne une *Machine à Empêcher* au lieu de contribuer à une *Machine à Rendre Capable*.

Cette posture est une **décision de gouvernance v0 révisable**, non une preuve de sécurité et non une dispense des obligations applicables aux données, aux tiers et aux actes engageants.

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
