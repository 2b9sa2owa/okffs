<!-- okffs:type=Changed -->
- `body` is now the canonical issue-body param across `create_issue`, `plan`, and `create_issues_from_list` (matching `update_issue` and GitHub's own field); `description` remains as a deprecated alias for one release — using it warns, passing both errors ([#282](https://github.com/neturely/okffs/issues/282))
