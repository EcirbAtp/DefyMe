# DefyMe — instructions pour Claude

## Skill task-observer (amélioration continue des skills)

Le skill `task-observer` est installé dans `.claude/skills/task-observer/`
(source : github.com/rebelytics/one-skill-to-rule-them-all, CC BY 4.0, Eoghan Henn et contributeurs).

Avant le premier appel d'outil de toute session — et avant d'écrire ou de proposer un plan — invoquer le skill
`task-observer` ET exécuter son « Session Start Protocol » (vérification du stockage, lecture des en-têtes du journal,
déclencheur de revue). Charger le skill et exécuter le protocole sont deux étapes distinctes. Tout tour qui
utilisera un outil compte ; ne pas juger la session « trop simple » d'après son premier message.

Choisir les skills d'après la DÉCISION en jeu, pas d'après la forme de la demande (un fichier à relire peut
relever d'un skill qui nomme son sujet).

Après chaque tâche terminée, lister les observations écrites pendant la session, dans le même tour, et en donner
un résumé d'une ligne à partir de cette liste (numéros et titres, ou « aucune, et pourquoi ») — jamais de mémoire.

Le chargement d'un skill n'est complet qu'après lecture des observations OUVERTES qui le nomment, en une seule
commande, dans le même lot que l'invocation du skill :
  bash "$RACINE/.claude/skills/task-observer/scripts/skill-load.sh" "$RACINE" <nom-du-skill>
Appliquer leurs enseignements au travail en cours ; modifier un fichier de skill, ou écrire la règle dans un
fichier qu'une session future lira, attend la revue (voir « Log, don't act » dans SKILL.md).

**Espace de travail du skill : la racine de ce dépôt.** `$RACINE` = le chemin absolu donné par
`git rev-parse --show-toplevel` (dans le dépôt principal, jamais dans un worktree ni un sous-dossier).
Tous les chemins en dérivent :
  $RACINE/skill-observations/observation-log/      (le journal, un fichier par observation)
  $RACINE/skill-observations/cross-cutting-principles.md
  $RACINE/skill-updates/                           (mises à jour de skills proposées)
  $RACINE/skill-updates/PENDING.md                 (liste des mises à jour proposées)
Raison : les sessions cloud tournent dans un conteneur jetable ; seul ce qui est commité et poussé survit.
**Commiter et pousser `skill-observations/` et `skill-updates/` avec le travail de la session**, sur la branche
de la session, pour qu'ils arrivent dans la branche principale à la fusion. Une observation restée seulement
dans le conteneur est perdue.

Une observation n'est créée que par
  bash "$RACINE/.claude/skills/task-observer/scripts/new-observation.sh" <slug> "$RACINE"
qui affiche le chemin du fichier à remplir — jamais en copiant l'en-tête d'un autre fichier, y compris après
un compactage du contexte.

Un sous-agent lancé par une session qui exécute déjà ce protocole ne le relance pas et n'écrit pas dans le
journal : il signale ses constats dans son rapport final, et la session principale les écrit.
