# Minecraft Update Checker Action
Checks for new Minecraft Java Edition versions using Github Actions cache to compare version manifests.

## Inputs
| name                  | required | type   | default               | description |
| --------------------- | ---      | ------ | --------------------- | ----------- |
| version-mainfest-url  | no       | string | `https://launchermeta.mojang.com/mc/game/version_manifest_v2.json` | An url to the version manifest to check against
| cache-base-key        | no       | string | `mc-update-manifest-` | Base cache key. The cache key is the base followed by the action timestamp
| debug-disable-cache-storing | no | bool   | `false`               | [DEBUG] Whether to disable cache storing

## Outputs
| name | description |
| ---- | ----------- |
| id   | The new version id, or an empty string. For example, `21w42a`
| type | The new version type, or an empty string. Usually `release` or `snapshot`
| url  | A url to the version json of the new version, or an empty string

## Example usage
[`example-workflow.yml`](.github/workflows/example-workflow.yml)
```yaml
name: 'Minecraft Update check'

on:
  schedule:
    - cron: '*/30 * * * *' # Every 30 minutes
  workflow_dispatch: # Allow running the workflow manually

jobs:
  check-updates:
    runs-on: ubuntu-latest
    steps:
      - name: 'Check Minecraft updates'
        uses: ByMartrixX/minecraft-update-check-action@v0
        id: check
        with:
          cache-base-key: mc-manifest- # Cache keys will be like mc-manifest-1609470000

      - name: Print new version info
        if: ${{ steps.check.outputs.id != '' }}
        run: "echo \"New Minecraft '${{ steps.check.outputs.type }}' released: ${{ steps.check.outputs.id }}\nUrl: ${{ steps.check.outputs.url }}\""

```
