# Dependency updates

Dependabot checks npm daily at 06:00 Asia/Baghdad and GitHub Actions each Monday
at the same time. Security updates are enabled in the repository settings.
Patch/minor updates are grouped; major updates remain available for review.

The custom auto-merge workflow runs after successful pull-request CI. It uses
only the trusted default branch and GitHub API data, without installing packages,
executing PR code, or consuming PR artifacts with its write token.

An update is eligible only when:

- it is an open, same-repository Dependabot PR targeting the default branch;
- its single commit has a verified Dependabot signature and recognized metadata;
- it modifies only npm manifests/lockfiles or GitHub Actions workflows;
- every update is patch/minor (resolved npm versions are checked, including
  security updates whose metadata omits the update type);
- its branch is based on the current default branch;
- CI passed for that exact head and base, including the dependency vulnerability
  audit, build/tests, Roundcube browser E2E and native Thunderbird E2E.

Unknown versions, prereleases, major upgrades, failed/skipped checks, stale
branches and unexpected files remain open. Dependabot's automatic rebasing can
refresh stale PRs; they must pass CI again before merging.

Immediately before merging, the workflow checks the PR and default branch again.
The merge API also atomically requires the tested PR head SHA. This is workflow
automation, not branch protection: people with write access can still merge or
push manually, and the API does not offer an atomic expected-base-SHA parameter.

After a squash merge the workflow explicitly dispatches CI on the default branch,
because merges using `GITHUB_TOKEN` do not trigger push workflows themselves.

For existing PRs, run **Dependabot auto-merge** from the Actions tab. It defaults
to a dry run. Disable the dry-run option to process eligible PRs. Turning off
this workflow stops automated merges without stopping Dependabot update PRs.
