# Agent Hub Fixture

This repository validates Agent Hub's Sandcastle-compatible Project Runner
boundary before production Project Repositories are connected.

The runner command is:

```sh
npm run sandcastle:run -- --issue <issue-number>
```

Each fixture task appends a timestamped marker, opens a pull request, reports a
review status, merges the pull request, and closes the source issue.
