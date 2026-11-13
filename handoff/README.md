# Handoff to stenhoor/smalt-geo

smaltgl moves to [stenhoor/smalt-geo](https://github.com/stenhoor/smalt-geo); its drawing code moves to smaltkit
(`smaltkit/geo`, `smaltkit/graph`; ADR 0003). The session that prepared the move could not push to stenhoor's
repositories, so the smalt-geo branch is kept here until it is pushed:

- `smalt-geo.bundle`: a git bundle of branch `claude/blissful-bohr-5k2i1i`, one commit on smalt-geo's initial commit.
- `smalt-geo-PR.md`: the pull request description for it.

To open the PR from a clone of smalt-geo (or a fork of it):

```sh
git fetch /path/to/smalt-geo.bundle claude/blissful-bohr-5k2i1i:claude/blissful-bohr-5k2i1i
git push origin claude/blissful-bohr-5k2i1i
```

The smaltkit side is branch `claude/blissful-bohr-5k2i1i` of `apbeers/smaltkit`, ready for a PR into stenhoor/smaltkit.
Delete this folder once both PRs are merged.
