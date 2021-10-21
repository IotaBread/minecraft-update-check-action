const core = require('@actions/core');
const cache = require('@actions/cache');
const fs = require('fs');
const download = require('download');

// Constants
const cachePaths = ['.cache'];

let manifestUrl = core.getInput('version-manifest-url');
if (!manifestUrl) {
    manifestUrl = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json';
}

let restoreKey = core.getInput('cache-base-key');
if (!restoreKey) {
    restoreKey = 'mc-update-manifest-';
}

async function main() {
    try {
        core.debug("Downloading cached manifest");
        let prevManifest;
        try {
            // Get last version manifest
            await cache.restoreCache(cachePaths, restoreKey + '0', // placeholder string, it should never match
                [restoreKey]);
            const prevManifestData = fs.readFileSync('./.cache/version_manifest_v2.json', 'utf8');

            prevManifest = JSON.parse(prevManifestData);
            core.debug(prevManifestData);
        } catch (error) {}

        core.debug("Downloading manifest");
        if (fs.existsSync('./version_manifest_v2.json')) {
            fs.rmSync('./version_manifest_v2.json');
        }
        await download(manifestUrl, './');
        const manifestData = fs.readFileSync('./version_manifest_v2.json', 'utf8');
        core.debug(manifestData);

        const manifest = JSON.parse(manifestData);

        // Compare manifest if present
        if (prevManifest) {
            core.debug("Comparing manifests");
            const prevVersions = prevManifest["versions"];
            const versions = manifest["versions"];

            const removeCommon = (a, b) => {
                const spreaded = [...a, ...b];
                return spreaded.filter(v => !(a.includes(e) && b.includes(e)));
            }
            const newVersions = removeCommon(prevVersions, versions);
            if (newVersions.length == 1) {
                const newVersion = newVersions[0];
                core.info("Found a new Minecraft version (of type '" + newVersion["type"] + "'): " + newVersion["id"]);
                core.setOutput('id', newVersion["id"]);
                core.setOutput('type', newVersion["type"]);
                core.setOutput('url', newVersion["url"]);
            } else {
                if (newVersions.length > 1) {
                    const newVersionIds = newVersions.map(v => v["id"]);
                    core.warning("Found more than one new Minecraft version: " + newVersionIds);
                } else {
                    core.debug("No new versions found");
                }

                core.setOutput('id', '');
                core.setOutput('type', '');
                core.setOutput('url', '');
            }
        }

        // Upload this version manifest as cache
        core.debug("Uploading new manifest to cache");
        const key = restoreKey + Date.now();
        try {
            await cache.saveCache(cachePaths, key);
            core.debug('Uploaded cache with key ' + key);
        } catch (error) {
            core.error('Failed to save version manifest to cache');
            throw error;
        }
    } catch (error) {
        core.setFailed(error.message);
    }
}

main()
